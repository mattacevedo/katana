// app/api/stripe/webhook/route.ts
// Listens for Stripe events and keeps Supabase profiles in sync.
//
// Critical events handled:
//   checkout.session.completed   → first-time purchase; set plan + save subscription ID
//   customer.subscription.updated → plan change (upgrade or downgrade)
//   customer.subscription.deleted → cancellation; immediately downgrade to free
//   invoice.payment_failed        → payment problem; downgrade to free after grace period
//
// IMPORTANT: this route must be excluded from Next.js body parsing so we can
// verify the raw Stripe signature. Set `export const config` below.
//
// Webhook setup:
//   stripe listen --forward-to localhost:3000/api/stripe/webhook  (local dev)
//   Add https://www.gradewithkatana.com/api/stripe/webhook in Stripe dashboard (prod)

import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { stripe, planFromPriceId } from '../../../../lib/stripe';
import { createAdminClient } from '../../../../lib/supabase/admin';
import { logActivity } from '../../../../lib/logActivity';
import { Redis } from '@upstash/redis';

// Required: disable Next.js body parser so we get the raw bytes for sig verification
export const config = { api: { bodyParser: false } };

// Validate UUID format for supabase_user_id values from Stripe metadata
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(v: string | undefined): v is string {
  return !!v && UUID_RE.test(v);
}

// ── Idempotency: deduplicate Stripe events via Upstash Redis ─────────────────
// Stripe can deliver the same event more than once. We use SET NX (atomic
// "set if not exists") with a 24-hour TTL so each event.id is processed at most
// once. Gracefully degrades to no-dedup if Redis isn't configured yet.
const redis = (
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
)
  ? new Redis({
      url:   process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

/** Returns true when this event ID was already processed (duplicate). */
async function markEventSeen(eventId: string): Promise<boolean> {
  if (!redis) return false; // Redis not configured — skip dedup
  // SET NX returns 'OK' on first insert, null if the key already exists
  const result = await redis.set(`katana:webhook:${eventId}`, '1', { nx: true, ex: 86400 });
  return result === null; // null → duplicate
}

export async function POST(req: NextRequest) {
  // ── 0. Verify webhook secret is configured ────────────────────────────────
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error('webhook: STRIPE_WEBHOOK_SECRET is not configured');
    return NextResponse.json({ error: 'Webhook not configured.' }, { status: 500 });
  }

  // ── 1. Verify Stripe signature ────────────────────────────────────────────
  const rawBody = await req.text();
  const sig = req.headers.get('stripe-signature');

  if (!sig) {
    return NextResponse.json({ error: 'Missing stripe-signature header.' }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err);
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  // ── 1b. Idempotency: skip already-processed events ────────────────────────
  const isDuplicate = await markEventSeen(event.id);
  if (isDuplicate) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  const supabase = createAdminClient();

  // ── 2. Route events ───────────────────────────────────────────────────────
  // Unhandled exceptions → 500 so Stripe retries (transient DB/network failures).
  // Non-retryable logic errors (missing metadata, unknown customer) use `break`
  // so we return 200 and log server-side — retrying won't help.
  try {
    switch (event.type) {

      // ── Successful checkout: first-time subscription ──────────────────────
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode !== 'subscription') break;

        // metadata is set on the checkout session (not on subscription_data, which
        // is only a creation param and not present on the session object itself)
        const userId = session.metadata?.supabase_user_id;

        if (!isValidUuid(userId)) {
          console.error('webhook: checkout.session.completed — missing or invalid supabase_user_id in metadata');
          break; // non-retryable — Stripe cannot fix missing metadata by retrying
        }

        // Retrieve the full subscription to get the price ID
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        const priceId = subscription.items.data[0]?.price?.id;
        const plan = (priceId ? planFromPriceId(priceId) : null) || 'free';

        const { error: dbErr } = await supabase
          .from('profiles')
          .update({
            plan,
            stripe_customer_id:     session.customer as string,
            stripe_subscription_id: session.subscription as string,
          })
          .eq('id', userId);

        if (dbErr) throw new Error(`DB update failed: ${dbErr.message}`);

        console.log(`webhook: checkout.session.completed — plan ${plan}`);
        void logActivity('signup', `New ${plan} subscriber`, { plan });
        break;
      }

      // ── Subscription changed (upgrade / downgrade) ────────────────────────
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;

        if (!isValidUuid(userId)) {
          // Fall back to looking up by stripe_customer_id
          await syncPlanByCustomerId(
            supabase, subscription.customer as string, subscription
          );
          break;
        }

        const priceId = subscription.items.data[0]?.price?.id;
        const plan = (priceId ? planFromPriceId(priceId) : null) || 'free';

        const { error: dbErr } = await supabase
          .from('profiles')
          .update({ plan, stripe_subscription_id: subscription.id })
          .eq('id', userId);

        if (dbErr) throw new Error(`DB update failed: ${dbErr.message}`);

        console.log(`webhook: subscription.updated — plan ${plan}`);
        void logActivity('upgrade', `Plan updated → ${plan}`, { plan });
        break;
      }

      // ── Subscription cancelled: immediately revoke paid access ─────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;

        if (isValidUuid(userId)) {
          const { error: dbErr } = await supabase
            .from('profiles')
            .update({ plan: 'free', stripe_subscription_id: null })
            .eq('id', userId);

          if (dbErr) throw new Error(`DB update failed: ${dbErr.message}`);

          console.log('webhook: subscription.deleted → free');
          void logActivity('cancel', 'Subscription ended → free', {});
        } else {
          await syncPlanByCustomerId(supabase, subscription.customer as string, null);
        }
        break;
      }

      // ── Payment failed: downgrade to free ─────────────────────────────────
      // Stripe retries payments automatically over several days. We downgrade
      // immediately on the first failure to prevent unpaid access. Adjust this
      // to your preference (e.g. wait until `invoice.payment_action_required`).
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        if (!invoice.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(
          invoice.subscription as string
        );
        const userId = subscription.metadata?.supabase_user_id;

        if (isValidUuid(userId)) {
          const { error: dbErr } = await supabase
            .from('profiles')
            .update({ plan: 'free' })
            .eq('id', userId);

          if (dbErr) throw new Error(`DB update failed: ${dbErr.message}`);

          console.warn('webhook: invoice.payment_failed — downgraded to free');
          void logActivity('payment_failed', 'Payment failed → downgraded to free', {});
        } else {
          await syncPlanByCustomerId(supabase, subscription.customer as string, null);
        }
        break;
      }

      default:
        // Unhandled event — safe to ignore
        break;
    }
  } catch (err) {
    // Return 500 so Stripe retries — covers transient DB or network failures.
    console.error(
      `webhook: error processing event ${event.type}:`,
      err instanceof Error ? err.message : String(err)
    );
    return NextResponse.json({ error: 'Internal error. Stripe will retry.' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}

// ── Fallback: look up user by stripe_customer_id ──────────────────────────
// Used when supabase_user_id isn't in subscription metadata (e.g. older subs).
// Throws on DB error so the caller's try/catch returns 500 for Stripe to retry.
async function syncPlanByCustomerId(
  supabase: ReturnType<typeof createAdminClient>,
  customerId: string,
  subscription: Stripe.Subscription | null
) {
  const { data: profile, error: lookupErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (lookupErr || !profile) {
    // Customer not found — non-retryable; log without exposing the customer ID
    console.error('webhook: no profile found for Stripe customer');
    return;
  }

  const plan = subscription
    ? (planFromPriceId(subscription.items.data[0]?.price?.id) ?? 'free')
    : 'free';

  const { error: dbErr } = await supabase
    .from('profiles')
    .update({ plan, stripe_subscription_id: subscription?.id ?? null })
    .eq('id', profile.id);

  if (dbErr) throw new Error(`DB update failed in syncPlanByCustomerId: ${dbErr.message}`);

  console.log(`webhook: synced customer → plan ${plan}`);
}
