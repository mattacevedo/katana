// lib/stripe.ts — Stripe client + plan/price mappings

import Stripe from 'stripe';

// ─── Lazy client ──────────────────────────────────────────────────────────
// Instantiated on first use so the build doesn't fail when STRIPE_SECRET_KEY
// isn't present in the build environment.
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is not set.');
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-02-24.acacia',
    });
  }
  return _stripe;
}

// Convenience re-export for code that already uses `stripe.xxx`
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as unknown as Record<string | symbol, unknown>)[prop];
  },
});

// ─── Price ID → plan name ─────────────────────────────────────────────────
// Set these in Vercel env vars after creating products in the Stripe dashboard.
export const STRIPE_PRICES = {
  basic_monthly:  process.env.STRIPE_PRICE_BASIC_MONTHLY  || '',
  super_monthly:  process.env.STRIPE_PRICE_SUPER_MONTHLY  || '',
  shogun_monthly: process.env.STRIPE_PRICE_SHOGUN_MONTHLY || '',
} as const;

// Reverse map: price ID → internal plan slug
export function planFromPriceId(priceId: string): string | null {
  for (const [key, id] of Object.entries(STRIPE_PRICES)) {
    if (id && id === priceId) {
      return key.replace('_monthly', '').replace('_annual', '');
    }
  }
  return null;
}
