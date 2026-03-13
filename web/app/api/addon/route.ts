// app/api/addon/route.ts
//
// Creates a Stripe Checkout session for a one-time Grade Pack purchase.
// Only users on a paid plan (Basic, Super, Shogun) may purchase add-ons.
// Free users are redirected back to the dashboard with an error flag.
//
// On success, Stripe redirects to /dashboard?addon_purchased=1.
// The Stripe webhook (checkout.session.completed, mode: payment) then
// credits 100 bonus grades to the user's profile via add_bonus_grades().

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { createClient } from '../../../lib/supabase/server';
import { getStripe, STRIPE_ADDON_PRICE_ID } from '../../../lib/stripe';

const PAID_PLANS = new Set(['basic', 'super', 'shogun']);
const ADDON_GRADES = 100;

export async function GET(req: NextRequest) {
  // 1. Auth
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/auth/signin', req.url));
  }

  // 2. Check plan — free users cannot buy add-ons
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, stripe_customer_id, bonus_grades')
    .eq('id', user.id)
    .single();

  const plan        = profile?.plan || 'free';
  const bonusGrades = profile?.bonus_grades ?? 0;

  if (!PAID_PLANS.has(plan)) {
    return NextResponse.redirect(new URL('/dashboard?addon_error=plan', req.url));
  }

  // 2b. Guard: only allow purchase when existing balance is below 20
  //     Prevents grade-pack stockpiling while giving a small grace buffer.
  if (bonusGrades > 20) {
    return NextResponse.redirect(new URL('/dashboard?addon_error=has_credits', req.url));
  }

  // 3. Guard: price ID must be configured
  if (!STRIPE_ADDON_PRICE_ID) {
    console.error('api/addon: STRIPE_PRICE_ADDON_ONETIME is not set');
    return NextResponse.redirect(new URL('/dashboard?addon_error=config', req.url));
  }

  // 4. Create Stripe Checkout session (one-time payment)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.gradewithkatana.com';

  try {
    const stripe = getStripe();

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      mode: 'payment',
      line_items: [{ price: STRIPE_ADDON_PRICE_ID, quantity: 1 }],
      success_url: `${appUrl}/dashboard?addon_purchased=1`,
      cancel_url:  `${appUrl}/dashboard`,
      // Pass user ID in metadata so the webhook can credit the right account
      metadata: { supabase_user_id: user.id, addon_grades: String(ADDON_GRADES) },
      payment_intent_data: {
        metadata: { supabase_user_id: user.id, addon_grades: String(ADDON_GRADES) },
      },
    };

    // Attach to existing Stripe customer if one exists
    if (profile?.stripe_customer_id) {
      sessionParams.customer = profile.stripe_customer_id;
    } else {
      sessionParams.customer_email = user.email ?? undefined;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);

    return NextResponse.redirect(session.url!);
  } catch (err) {
    console.error('api/addon: Stripe session creation failed', err);
    return NextResponse.redirect(new URL('/dashboard?addon_error=stripe', req.url));
  }
}
