// app/dashboard/cancel/page.tsx
// Cancellation confirmation page.
// Shows the user their current plan, the exact date their access ends,
// and requires an explicit click to confirm — no dark patterns.

import { redirect } from 'next/navigation';
import { createClient } from '../../../lib/supabase/server';
import { getStripe } from '../../../lib/stripe';
import Link from 'next/link';
import styles from './cancel.module.css';

const PLAN_DISPLAY: Record<string, string> = {
  basic:  'Basic — $9.99/mo',
  super:  'Super — $19.99/mo',
  shogun: 'Shogun — $39.99/mo',
};

export default async function CancelPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/signin');

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, stripe_subscription_id')
    .eq('id', user.id)
    .single();

  // Free users or users without a subscription have nothing to cancel
  if (!profile?.stripe_subscription_id || profile.plan === 'free') {
    redirect('/dashboard');
  }

  // Fetch live subscription to get the exact period-end date
  let periodEndDate = 'the end of your current billing period';
  try {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);

    // Already scheduled to cancel — nothing to do here
    if (sub.cancel_at_period_end) redirect('/dashboard');

    periodEndDate = new Date(sub.current_period_end * 1000).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
  } catch {
    // Non-fatal — continue with generic date copy
  }

  const { error } = await searchParams;
  const planLabel = PLAN_DISPLAY[profile.plan] ?? profile.plan;

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.logo}>⚔️ Katana</Link>
      </nav>

      <main className={styles.main}>
        <div className={styles.card}>
          <div className={styles.icon}>⚠️</div>

          <h1 className={styles.title}>Cancel your subscription?</h1>

          <p className={styles.body}>
            You&apos;re on the <strong>{planLabel}</strong> plan.
          </p>

          <div className={styles.accessBox}>
            <strong>Your access continues until {periodEndDate}.</strong>
            <br />
            After that your account reverts to the Free plan (50 grades / billing period).
            You can re-subscribe at any time.
          </div>

          {error && (
            <p className={styles.errorMsg}>
              Something went wrong — please try again or email us at{' '}
              <a href="mailto:hello@gradewithkatana.com">hello@gradewithkatana.com</a>.
            </p>
          )}

          <div className={styles.actions}>
            {/* Keep plan is the prominent option — good UX, not dark pattern */}
            <Link href="/dashboard" className={styles.btnKeep}>
              Never mind, keep my plan
            </Link>

            <form action="/api/billing/cancel" method="post">
              <button type="submit" className={styles.btnCancel}>
                Yes, cancel at end of period
              </button>
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}
