// lib/stripe.ts — Stripe client + plan/price mappings

import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
});

// ─── Price ID → plan name ─────────────────────────────────────────────────
// Set these in Vercel env vars after creating products in the Stripe dashboard.
// Each plan gets a monthly price ID. Add _ANNUAL variants when ready.
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
