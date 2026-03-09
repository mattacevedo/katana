// app/dashboard/page.tsx
// Authenticated user dashboard — shows usage, plan, and billing link.

import { redirect } from 'next/navigation';
import { createClient } from '../../lib/supabase/server';
import Link from 'next/link';
import styles from './dashboard.module.css';

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
  const limit = plan === 'free' ? 50 : null;
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
            <div className={styles.cardValue}>{plan.charAt(0).toUpperCase() + plan.slice(1)}</div>
            {plan === 'free' && (
              <Link href="/billing" className={styles.upgradeLink}>Upgrade to Pro →</Link>
            )}
          </div>

          <div className={styles.card}>
            <div className={styles.cardLabel}>Grades Used</div>
            <div className={styles.cardValue}>
              {used}{limit !== null ? ` / ${limit}` : ''}
            </div>
            <div className={styles.cardSub}>Since {periodStart}</div>
            {limit !== null && (
              <div className={styles.progressBar}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${Math.min(100, (used / limit) * 100)}%` }}
                />
              </div>
            )}
          </div>

          <div className={styles.card}>
            <div className={styles.cardLabel}>Extension</div>
            <div className={styles.cardValue} style={{ fontSize: 14, marginTop: 4 }}>
              Install the Chrome extension from the Web Store, then sign in from the side panel.
            </div>
            <a
              href="https://chrome.google.com/webstore/detail/katana/PLACEHOLDER"
              target="_blank"
              rel="noopener"
              className={styles.upgradeLink}
            >
              Open Chrome Web Store →
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}
