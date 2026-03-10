// app/api/stripe/checkout/route.ts
// Creates a Stripe Checkout session for the given plan.
//
// Called by the Chrome extension (or the web UI) when the user clicks "Upgrade".
// Flow:
//   1. Validate the user's Supabase Bearer token
//   2. Get or create a Stripe Customer for this user
//   3. Save the stripe_customer_id back to their profile
//   4. Create a hosted Checkout session with the requested price
//   5. Return the session URL — the client redirects there

import { NextRequest, NextResponse } from 'next/server';
import { stripe, STRIPE_PRICES, planFromPriceId } from '../../../../lib/stripe';
import { createAdminClient } from '../../../../lib/supabase/admin';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.gradewithkatana.com';

function json(body: object, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest) {
  // ── 1. Auth ─────────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing authorization token.' }, 401);
  }
  const token = authHeader.slice(7);

  const supabase = createAdminClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return json({ error: 'Invalid or expired session. Please sign in again.' }, 401);
  }

  // ── 2. Validate requested plan ────────────────────────────────────────────
  let body: { plan: string };
  try { body = await req.json(); } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const planToPriceId: Record<string, string> = {
    basic:  STRIPE_PRICES.basic_monthly,
    super:  STRIPE_PRICES.super_monthly,
    shogun: STRIPE_PRICES.shogun_monthly,
  };

  const priceId = planToPriceId[body.plan];
  if (!priceId) {
    return json({ error: 'Invalid plan. Choose basic, super, or shogun.' }, 400);
  }

  // ── 3. Get or create Stripe Customer ─────────────────────────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id')
    .eq('id', user.id)
    .single();

  let customerId: string = profile?.stripe_customer_id || '';

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { supabase_user_id: user.id },
    });
    customerId = customer.id;

    // Persist immediately so future calls reuse the same customer
    await supabase
      .from('profiles')
      .update({ stripe_customer_id: customerId })
      .eq('id', user.id);
  }

  // ── 4. Create Checkout session ────────────────────────────────────────────
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    // session.metadata → read by checkout.session.completed webhook
    metadata: { supabase_user_id: user.id },
    // subscription.metadata → read by subscription.updated / .deleted webhooks
    subscription_data: {
      metadata: { supabase_user_id: user.id },
    },
    success_url: `${SITE_URL}/dashboard?upgraded=1`,
    cancel_url:  `${SITE_URL}/#pricing`,
    allow_promotion_codes: true,
  });

  return json({ url: session.url });
}

// CORS preflight — extension needs this
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin':  `chrome-extension://${process.env.NEXT_PUBLIC_EXTENSION_ID || ''}`,
      'Access-Control-Allow-Methods': 'POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    },
  });
}
