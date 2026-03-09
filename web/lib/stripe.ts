// lib/stripe.ts — Stripe client + webhook helpers

import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2024-06-20',
});

// Price IDs — set these after creating products in the Stripe dashboard
export const STRIPE_PRICES = {
  pro_monthly:    process.env.STRIPE_PRO_MONTHLY_PRICE_ID    || '',
  pro_annual:     process.env.STRIPE_PRO_ANNUAL_PRICE_ID     || '',
} as const;
