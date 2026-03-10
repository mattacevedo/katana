// app/dashboard/page.tsx
// Authenticated user dashboard — shows usage, plan, and billing link.

import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import Link from 'next/link';
import styles from './dashboard.module.css';
import { getStripe } from '../../lib/stripe';
import type Stripe from 'stripe';

interface SubscriptionStatus {
  cancelAtPeriodEnd: boolean;
  periodEnd: string; // formatted date string
}

const PLAN_LIMITS: Record<string, number> = {
  free: 50,
  basic: 200,
  super: 1000,
  shogun: 2500,
};

const PLAN_DISPLAY: Record<string, string> = {
  free: 'Free',
  basic: 'Basic',
  super: 'Super',
  shogun: 'Shogun',
};

// Fetch up to 12 paid invoices from Stripe for a given customer.
async function fetchInvoices(stripeCustomerId: string): Promise<Stripe.Invoice[]> {
  try {
    const stripe = getStripe();
    const { data } = await stripe.invoices.list({
      customer: stripeCustomerId,
      limit: 12,
      status: 'paid',
    });
    return data;
  } catch {
    return [];
  }
}

// Fetch live subscription status (cancel_at_period_end + period end date).
async function fetchSubscriptionStatus(subscriptionId: string): Promise<SubscriptionStatus | null> {
  try {
    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    return {
      cancelAtPeriodEnd: sub.cancel_at_period_end,
      periodEnd: new Date(sub.current_period_end * 1000).toLocaleDateString('en-US', {
        year: 'numeric', month: 'long', day: 'numeric',
      }),
    };
  } catch {
    return null;
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ upgraded?: string; cancelled?: string }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/signin');

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, grades_this_period, period_start, stripe_customer_id, stripe_subscription_id')
    .eq('id', user.id)
    .single();

  const plan = profile?.plan || 'free';
  const used = profile?.grades_this_period || 0;
  const limit = PLAN_LIMITS[plan] ?? 50;
  const periodStart = profile?.period_start
    ? new Date(profile.period_start).toLocaleDateString()
    : 'N/A';

  const stripeCustomerId    = profile?.stripe_customer_id ?? null;
  const stripeSubscriptionId = profile?.stripe_subscription_id ?? null;

  // Fetch Stripe data in parallel
  const [invoices, subStatus] = await Promise.all([
    stripeCustomerId    ? fetchInvoices(stripeCustomerId)                       : Promise.resolve([]),
    stripeSubscriptionId && plan !== 'free'
      ? fetchSubscriptionStatus(stripeSubscriptionId)
      : Promise.resolve(null),
  ]);

  const { cancelled, upgraded } = await searchParams;

  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.logo}>⚔️ Katana</Link>
        <form action="/auth/signout" method="post">
          <button type="submit" className={styles.btnSignOut}>Sign Out</button>
        </form>
      </nav>

      <main className={styles.main}>
        <h1 className={styles.title}>Dashboard</h1>
        <p className={styles.email}>{user.email}</p>

        {/* Success banners */}
        {upgraded === '1' && (
          <div className={styles.banner} data-type="success">
            🎉 You&apos;re now on the {PLAN_DISPLAY[plan] ?? plan} plan. Enjoy the extra grades!
          </div>
        )}
        {cancelled === '1' && subStatus && (
          <div className={styles.banner} data-type="info">
            Your subscription has been cancelled. You keep full access until <strong>{subStatus.periodEnd}</strong>.
          </div>
        )}

        <div className={styles.cards}>
          <div className={styles.card}>
            <div className={styles.cardLabel}>Plan</div>
            <div className={styles.cardValue}>{PLAN_DISPLAY[plan] ?? plan}</div>

            {/* Upgrade links for active paid users */}
            {plan === 'free' && (
              <Link href="/api/upgrade?plan=basic" className={styles.upgradeLink}>Upgrade to Basic →</Link>
            )}
            {plan === 'basic' && !subStatus?.cancelAtPeriodEnd && (
              <Link href="/api/upgrade?plan=super" className={styles.upgradeLink}>Upgrade to Super →</Link>
            )}
            {plan === 'super' && !subStatus?.cancelAtPeriodEnd && (
              <Link href="/api/upgrade?plan=shogun" className={styles.upgradeLink}>Upgrade to Shogun →</Link>
            )}

            {/* Cancellation notice or cancel link */}
            {subStatus?.cancelAtPeriodEnd ? (
              <div className={styles.cancelNotice}>
                Cancels {subStatus.periodEnd} — access continues until then
              </div>
            ) : plan !== 'free' && (
              <Link href="/dashboard/cancel" className={styles.cancelLink}>Cancel subscription</Link>
            )}
          </div>

          <div className={styles.card}>
            <div className={styles.cardLabel}>Grades Used</div>
            <div className={styles.cardValue}>
              {used} / {limit}
            </div>
            <div className={styles.cardSub}>Since {periodStart}</div>
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${Math.min(100, (used / limit) * 100)}%` }}
              />
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardLabel}>Chrome Extension</div>
            <div className={styles.cardValue} style={{ fontSize: 14, marginTop: 4 }}>
              The Katana Chrome extension is coming soon to the Chrome Web Store.
              You&apos;ll receive an email when it&apos;s available.
            </div>
          </div>
        </div>

        {/* ── Order History ─────────────────────────────────── */}
        <section className={styles.orderSection}>
          <h2 className={styles.orderTitle}>Billing History</h2>

          {invoices.length === 0 ? (
            <div className={styles.orderEmpty}>
              No transactions yet.{plan === 'free' && ' Upgrade to a paid plan to get started.'}
            </div>
          ) : (
            <div className={styles.orderTable}>
              <div className={styles.orderHeader}>
                <span>Date</span>
                <span>Description</span>
                <span>Amount</span>
                <span>Status</span>
                <span></span>
              </div>
              {invoices.map(inv => {
                const date   = new Date(inv.created * 1000).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
                const desc   = inv.lines.data[0]?.description ?? inv.number ?? 'Subscription';
                const amount = inv.amount_paid != null
                  ? new Intl.NumberFormat('en-US', { style: 'currency', currency: inv.currency.toUpperCase() }).format(inv.amount_paid / 100)
                  : '—';
                return (
                  <div key={inv.id} className={styles.orderRow}>
                    <span className={styles.orderDate}>{date}</span>
                    <span className={styles.orderDesc}>{desc}</span>
                    <span className={styles.orderAmount}>{amount}</span>
                    <span className={styles.orderStatus}>
                      <span className={styles.badge}>Paid</span>
                    </span>
                    <span>
                      {inv.invoice_pdf && (
                        <a href={inv.invoice_pdf} target="_blank" rel="noreferrer" className={styles.orderLink}>
                          Receipt ↗
                        </a>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
