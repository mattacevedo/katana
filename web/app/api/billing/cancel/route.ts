// app/api/billing/cancel/route.ts
//
// Sets cancel_at_period_end = true on the user's Stripe subscription.
// The user keeps full paid access until the end of the current billing period;
// the existing webhook handler (customer.subscription.deleted) then downgrades
// them to free when the period actually expires.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { getStripe } from '../../../../lib/stripe';

export async function POST(req: NextRequest) {
  // ── CSRF guard: ensure the request originates from our own app ────────────
  const requestOrigin = req.headers.get('origin');
  const { origin: appOrigin } = new URL(req.url);
  if (!requestOrigin || requestOrigin !== appOrigin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/auth/signin', req.url));
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_subscription_id, plan')
    .eq('id', user.id)
    .single();

  // Nothing to cancel for free users or those without a subscription ID
  if (!profile?.stripe_subscription_id || profile.plan === 'free') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  try {
    const stripe = getStripe();
    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
    console.log('billing/cancel: cancel_at_period_end set');
    return NextResponse.redirect(new URL('/dashboard?cancelled=1', req.url));
  } catch (err) {
    console.error('billing/cancel: Stripe error', err);
    return NextResponse.redirect(new URL('/dashboard/cancel?error=1', req.url));
  }
}
