-- Migration: add Stripe columns to profiles
-- Run this in the Supabase SQL editor (Dashboard → SQL Editor → New query)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE;

-- Index for the webhook fallback lookup (customer_id → profile)
CREATE INDEX IF NOT EXISTS profiles_stripe_customer_id_idx
  ON public.profiles (stripe_customer_id);

-- The webhook uses the service-role key, which bypasses RLS,
-- so no additional RLS policies are needed for these columns.
-- Users should NOT be able to write these columns themselves:
-- ensure your existing RLS policy on profiles restricts UPDATE
-- to only the columns users legitimately control (e.g. display_name).
