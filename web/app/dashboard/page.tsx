// app/dashboard/page.tsx
// Authenticated user dashboard — shows usage, plan, and billing link.

import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import Link from 'next/link';
import styles from './dashboard.module.css';

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

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/auth/signin');

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, grades_this_period, period_start')
    .eq('id', user.id)
    .single();

  const plan = profile?.plan || 'free';
  const used = profile?.grades_this_period || 0;
  const limit = PLAN_LIMITS[plan] ?? 50;
  const periodStart = profile?.period_start
    ? new Date(profile.period_start).toLocaleDateString()
    : 'N/A';

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

        <div className={styles.cards}>
          <div className={styles.card}>
            <div className={styles.cardLabel}>Plan</div>
            <div className={styles.cardValue}>{PLAN_DISPLAY[plan] ?? plan}</div>
            {plan === 'free' && (
              <Link href="/#pricing" className={styles.upgradeLink}>View upgrade options →</Link>
            )}
            {plan !== 'free' && plan !== 'shogun' && (
              <Link href="/#pricing" className={styles.upgradeLink}>Upgrade plan →</Link>
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
      </main>
    </div>
  );
}
