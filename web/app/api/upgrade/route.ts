// app/api/upgrade/route.ts
//
// GET /api/upgrade?plan=basic|super|shogun
//
// Smart upgrade redirect:
//   • Logged-in users  → create Stripe Checkout session immediately, redirect to Stripe
//   • Logged-out users → redirect to /auth/signin?plan=X&next=/api/upgrade?plan=X
//                        so after magic-link auth they land back here and proceed to Stripe

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { createAdminClient } from '../../../lib/supabase/admin';
import { stripe, STRIPE_PRICES } from '../../../lib/stripe';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.gradewithkatana.com';

// Rate limit: max 10 checkout session creations per user per hour
const upgradeRatelimit = (
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
)
  ? new Ratelimit({
      redis: new Redis({
        url:   process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      }),
      limiter: Ratelimit.slidingWindow(10, '1 h'),
      prefix: 'katana:upgrade',
    })
  : null;

const PLAN_PRICE: Record<string, string> = {
  basic:  STRIPE_PRICES.basic_monthly,
  super:  STRIPE_PRICES.super_monthly,
  shogun: STRIPE_PRICES.shogun_monthly,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const plan = searchParams.get('plan') || '';

  if (!PLAN_PRICE[plan]) {
    // Unknown plan — send them to the pricing section
    return NextResponse.redirect(`${SITE_URL}/#pricing`);
  }

  // ── Check session ────────────────────────────────────────────────────────
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Rate limit by IP for logged-out users, by user ID for logged-in users
  if (upgradeRatelimit && user) {
    const { success } = await upgradeRatelimit.limit(`user:${user.id}`);
    if (!success) {
      return NextResponse.redirect(`${SITE_URL}/#pricing`);
    }
  }

  if (!user) {
    // Not signed in — send to sign-in, then back here after auth
    const next = `/api/upgrade?plan=${encodeURIComponent(plan)}`;
    return NextResponse.redirect(
      `${SITE_URL}/auth/signin?plan=${encodeURIComponent(plan)}&next=${encodeURIComponent(next)}`
    );
  }

  // ── Already signed in — go straight to Stripe ──────────────────────────
  const adminClient = createAdminClient();

  // Get or create Stripe Customer
  const { data: profile } = await adminClient
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single();

  let customerId = profile?.stripe_customer_id || '';

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;

    await adminClient
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id);
  }

  // Create Stripe Checkout session
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: PLAN_PRICE[plan], quantity: 1 }],
    metadata: { supabase_user_id: user.id },
    subscription_data: { metadata: { supabase_user_id: user.id } },
    success_url: `${SITE_URL}/dashboard?upgraded=1`,
    cancel_url:  `${SITE_URL}/#pricing`,
    allow_promotion_codes: true,
  });

  return NextResponse.redirect(session.url!);
}
