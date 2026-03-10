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

// Required: disable Next.js body parser so we get the raw bytes for sig verification
export const config = { api: { bodyParser: false } };

// Validate UUID format for supabase_user_id values from Stripe metadata
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function isValidUuid(v: string | undefined): v is string {
  return !!v && UUID_RE.test(v);
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

  const supabase = createAdminClient();

  // ── 2. Route events ───────────────────────────────────────────────────────
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
          break;
        }

        // Retrieve the full subscription to get the price ID
        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        const priceId = subscription.items.data[0]?.price?.id;
        const plan = (priceId ? planFromPriceId(priceId) : null) || 'free';

        await supabase
          .from('profiles')
          .update({
            plan,
            stripe_customer_id:     session.customer as string,
            stripe_subscription_id: session.subscription as string,
          })
          .eq('id', userId);

        console.log(`webhook: checkout.session.completed — user ${userId} → plan ${plan}`);
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

        await supabase
          .from('profiles')
          .update({ plan, stripe_subscription_id: subscription.id })
          .eq('id', userId);

        console.log(`webhook: subscription.updated — user ${userId} → plan ${plan}`);
        break;
      }

      // ── Subscription cancelled: immediately revoke paid access ─────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;

        if (isValidUuid(userId)) {
          await supabase
            .from('profiles')
            .update({ plan: 'free', stripe_subscription_id: null })
            .eq('id', userId);
          console.log(`webhook: subscription.deleted — user ${userId} → free`);
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
          await supabase
            .from('profiles')
            .update({ plan: 'free' })
            .eq('id', userId);
          console.warn(`webhook: invoice.payment_failed — user ${userId} downgraded to free`);
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
    console.error(`webhook: error processing event ${event.type}:`, err);
    // Return 200 so Stripe doesn't retry — log and investigate manually
  }

  return NextResponse.json({ received: true });
}

// ── Fallback: look up user by stripe_customer_id ──────────────────────────
// Used when supabase_user_id isn't in subscription metadata (e.g. older subs).
async function syncPlanByCustomerId(
  supabase: ReturnType<typeof createAdminClient>,
  customerId: string,
  subscription: Stripe.Subscription | null
) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('stripe_customer_id', customerId)
    .single();

  if (!profile) {
    console.error(`webhook: no profile found for customer ${customerId}`);
    return;
  }

  const plan = subscription
    ? (planFromPriceId(subscription.items.data[0]?.price?.id) ?? 'free')
    : 'free';

  await supabase
    .from('profiles')
    .update({ plan, stripe_subscription_id: subscription?.id ?? null })
    .eq('id', profile.id);

  console.log(`webhook: synced customer ${customerId} → plan ${plan}`);
}
