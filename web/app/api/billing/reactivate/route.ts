// app/api/billing/reactivate/route.ts
//
// Clears cancel_at_period_end on the user's Stripe subscription,
// reinstating their paid access through the normal renewal cycle.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { getStripe } from '../../../../lib/stripe';
import { logActivity } from '../../../../lib/logActivity';

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

  // Nothing to reactivate for free users or those without a subscription
  if (!profile?.stripe_subscription_id || profile.plan === 'free') {
    return NextResponse.redirect(new URL('/dashboard', req.url));
  }

  try {
    const stripe = getStripe();
    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      cancel_at_period_end: false,
    });
    console.log('billing/reactivate: cancel_at_period_end cleared');
    void logActivity('reactivate', `Subscription reactivated on ${profile.plan} plan`, { plan: profile.plan });
    return NextResponse.redirect(new URL('/dashboard?reactivated=1', req.url));
  } catch (err) {
    console.error('billing/reactivate: Stripe error', err);
    return NextResponse.redirect(new URL('/dashboard?error=reactivate', req.url));
  }
}
