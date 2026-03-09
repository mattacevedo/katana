// app/admin/page.tsx — Admin dashboard (server component)
// Protected by ADMIN_EMAIL env var. Uses service-role Supabase client to
// bypass RLS and read aggregate data across all users.

import { redirect } from 'next/navigation';
import { createClient as createServerClient } from '../../lib/supabase/server';
import { createAdminClient } from '../../lib/supabase/admin';
import Link from 'next/link';
import styles from './admin.module.css';

const PLAN_PRICES: Record<string, number> = {
  free:   0,
  basic:  5,
  super:  20,
  shogun: 50,
};

const PLAN_LIMITS: Record<string, number> = {
  free:   50,
  basic:  200,
  super:  1000,
  shogun: 2500,
};

const PLAN_ORDER = ['free', 'basic', 'super', 'shogun'];

function fmt(n: number, decimals = 0) {
  return n.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
function fmtUsd(n: number) {
  return '$' + fmt(n, 2);
}
function fmtDate(d: string | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default async function AdminPage() {
  // ── Auth check ────────────────────────────────────────────────────────────
  const serverSupabase = await createServerClient();
  const { data: { user } } = await serverSupabase.auth.getUser();
  if (!user) redirect('/auth/signin');

  const adminEmail = process.env.ADMIN_EMAIL || '';
  if (!adminEmail || user.email !== adminEmail) redirect('/');

  // ── Fetch all data with service role ──────────────────────────────────────
  const admin = createAdminClient();

  // All profiles
  const { data: profiles = [] } = await admin
    .from('profiles')
    .select('id, plan, grades_this_period, period_start, created_at')
    .order('grades_this_period', { ascending: false });

  // All auth users (emails, signup dates)
  const { data: { users: authUsers = [] } } = await admin.auth.admin.listUsers({
    perPage: 1000,
  });

  // ── Build unified user list ───────────────────────────────────────────────
  const profileMap = new Map((profiles ?? []).map((p: Record<string, unknown>) => [p.id as string, p]));

  type UserRow = {
    id: string;
    email: string;
    createdAt: string;
    plan: string;
    gradesUsed: number;
    periodStart: string | null;
    usagePct: number;
  };

  const userRows: UserRow[] = authUsers.map((u) => {
    const profile = profileMap.get(u.id) as Record<string, unknown> | undefined;
    const plan = (profile?.plan as string) || 'free';
    const gradesUsed = (profile?.grades_this_period as number) || 0;
    const limit = PLAN_LIMITS[plan] ?? 50;
    return {
      id: u.id,
      email: u.email ?? '—',
      createdAt: u.created_at ?? '',
      plan,
      gradesUsed,
      periodStart: (profile?.period_start as string) ?? null,
      usagePct: limit > 0 ? Math.min(100, (gradesUsed / limit) * 100) : 0,
    };
  });

  // ── Aggregate metrics ──────────────────────────────────────────────────────
  const totalUsers = userRows.length;

  // Plan breakdown
  const planBreakdown = PLAN_ORDER.map(plan => {
    const users = userRows.filter(u => u.plan === plan);
    const count = users.length;
    const price = PLAN_PRICES[plan];
    const mrr = count * price;
    const gradesTotal = users.reduce((s, u) => s + u.gradesUsed, 0);
    return { plan, count, price, mrr, gradesTotal };
  });

  const mrr = planBreakdown.reduce((s, p) => s + p.mrr, 0);
  const arr = mrr * 12;
  const payingUsers = userRows.filter(u => u.plan !== 'free').length;
  const totalGradesThisPeriod = userRows.reduce((s, u) => s + u.gradesUsed, 0);
  const avgGradesPerUser = totalUsers > 0 ? totalGradesThisPeriod / totalUsers : 0;
  const avgGradesPerPaying = payingUsers > 0
    ? userRows.filter(u => u.plan !== 'free').reduce((s, u) => s + u.gradesUsed, 0) / payingUsers
    : 0;

  // Estimate Claude API cost — rough: $0.003 per grade (input) + $0.006 (output) ≈ $0.009/grade
  const COST_PER_GRADE = 0.009;
  const estimatedApiCost = totalGradesThisPeriod * COST_PER_GRADE;

  // Recent signups
  const recentSignups = [...userRows]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 15);

  // Top users by usage
  const topUsers = [...userRows]
    .sort((a, b) => b.gradesUsed - a.gradesUsed)
    .slice(0, 20);

  const planColors: Record<string, string> = {
    free: '#6b7280',
    basic: '#2563eb',
    super: '#7c3aed',
    shogun: '#b45309',
  };

  return (
    <div className={styles.page}>
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <nav className={styles.nav}>
        <div className={styles.navLeft}>
          <span className={styles.logo}>⚔️ Katana</span>
          <span className={styles.adminBadge}>Admin</span>
        </div>
        <div className={styles.navRight}>
          <span className={styles.navEmail}>{user.email}</span>
          <Link href="/" className={styles.navLink}>← Back to site</Link>
          <Link href="/dashboard" className={styles.navLink}>User dashboard</Link>
        </div>
      </nav>

      <main className={styles.main}>
        <h1 className={styles.pageTitle}>Dashboard</h1>
        <p className={styles.pageSubtitle}>
          Live data from Supabase · {new Date().toLocaleString('en-US', { dateStyle: 'long', timeStyle: 'short' })}
        </p>

        {/* ── KPI cards ──────────────────────────────────────────────────── */}
        <div className={styles.kpiRow}>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>Monthly Recurring Revenue</div>
            <div className={styles.kpiValue}>{fmtUsd(mrr)}</div>
            <div className={styles.kpiSub}>ARR: {fmtUsd(arr)}</div>
          </div>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>Total Users</div>
            <div className={styles.kpiValue}>{fmt(totalUsers)}</div>
            <div className={styles.kpiSub}>{fmt(payingUsers)} paying · {fmt(totalUsers - payingUsers)} free</div>
          </div>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>Grades This Period</div>
            <div className={styles.kpiValue}>{fmt(totalGradesThisPeriod)}</div>
            <div className={styles.kpiSub}>Avg {fmt(avgGradesPerUser, 1)} / user · {fmt(avgGradesPerPaying, 1)} / paying</div>
          </div>
          <div className={styles.kpiCard}>
            <div className={styles.kpiLabel}>Est. Claude API Cost</div>
            <div className={styles.kpiValue}>{fmtUsd(estimatedApiCost)}</div>
            <div className={styles.kpiSub}>~$0.009 / grade · margin {fmtUsd(mrr - estimatedApiCost)}/mo</div>
          </div>
        </div>

        {/* ── Plan breakdown ─────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Plan Breakdown</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Plan</th>
                  <th className={styles.num}>Price</th>
                  <th className={styles.num}>Users</th>
                  <th className={styles.num}>MRR</th>
                  <th className={styles.num}>Grades Used</th>
                  <th className={styles.num}>Avg / User</th>
                  <th>Usage bar</th>
                </tr>
              </thead>
              <tbody>
                {planBreakdown.map(({ plan, count, price, mrr: planMrr, gradesTotal }) => {
                  const maxUsers = Math.max(...planBreakdown.map(p => p.count), 1);
                  return (
                    <tr key={plan}>
                      <td>
                        <span
                          className={styles.planTag}
                          style={{ background: planColors[plan] + '22', color: planColors[plan], borderColor: planColors[plan] + '44' }}
                        >
                          {plan.charAt(0).toUpperCase() + plan.slice(1)}
                        </span>
                      </td>
                      <td className={styles.num}>{price === 0 ? 'Free' : fmtUsd(price) + '/mo'}</td>
                      <td className={styles.num}>{fmt(count)}</td>
                      <td className={styles.num}>{planMrr > 0 ? fmtUsd(planMrr) : '—'}</td>
                      <td className={styles.num}>{fmt(gradesTotal)}</td>
                      <td className={styles.num}>{count > 0 ? fmt(gradesTotal / count, 1) : '—'}</td>
                      <td>
                        <div className={styles.miniBar}>
                          <div
                            className={styles.miniBarFill}
                            style={{
                              width: `${(count / maxUsers) * 100}%`,
                              background: planColors[plan],
                            }}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {/* Totals row */}
                <tr className={styles.totalRow}>
                  <td><strong>Total</strong></td>
                  <td className={styles.num}></td>
                  <td className={styles.num}><strong>{fmt(totalUsers)}</strong></td>
                  <td className={styles.num}><strong>{fmtUsd(mrr)}</strong></td>
                  <td className={styles.num}><strong>{fmt(totalGradesThisPeriod)}</strong></td>
                  <td className={styles.num}><strong>{fmt(avgGradesPerUser, 1)}</strong></td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Top users by usage ─────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Top Users by Usage (this period)</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Email</th>
                  <th>Plan</th>
                  <th className={styles.num}>Grades</th>
                  <th className={styles.num}>Limit</th>
                  <th className={styles.num}>% Used</th>
                  <th>Progress</th>
                  <th>Period Start</th>
                </tr>
              </thead>
              <tbody>
                {topUsers.map((u, i) => (
                  <tr key={u.id} className={u.usagePct >= 90 ? styles.highUsage : ''}>
                    <td className={styles.rowNum}>{i + 1}</td>
                    <td className={styles.emailCell}>{u.email}</td>
                    <td>
                      <span
                        className={styles.planTag}
                        style={{ background: planColors[u.plan] + '22', color: planColors[u.plan], borderColor: planColors[u.plan] + '44' }}
                      >
                        {u.plan.charAt(0).toUpperCase() + u.plan.slice(1)}
                      </span>
                    </td>
                    <td className={styles.num}>{fmt(u.gradesUsed)}</td>
                    <td className={styles.num}>{fmt(PLAN_LIMITS[u.plan] ?? 50)}</td>
                    <td className={styles.num}>{fmt(u.usagePct, 0)}%</td>
                    <td>
                      <div className={styles.miniBar}>
                        <div
                          className={styles.miniBarFill}
                          style={{
                            width: `${u.usagePct}%`,
                            background: u.usagePct >= 90 ? '#dc2626' : u.usagePct >= 70 ? '#f59e0b' : '#2563eb',
                          }}
                        />
                      </div>
                    </td>
                    <td>{fmtDate(u.periodStart)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Recent signups ──────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Recent Signups (last {recentSignups.length})</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Plan</th>
                  <th className={styles.num}>Grades Used</th>
                  <th>Signed Up</th>
                </tr>
              </thead>
              <tbody>
                {recentSignups.map(u => (
                  <tr key={u.id}>
                    <td className={styles.emailCell}>{u.email}</td>
                    <td>
                      <span
                        className={styles.planTag}
                        style={{ background: planColors[u.plan] + '22', color: planColors[u.plan], borderColor: planColors[u.plan] + '44' }}
                      >
                        {u.plan.charAt(0).toUpperCase() + u.plan.slice(1)}
                      </span>
                    </td>
                    <td className={styles.num}>{fmt(u.gradesUsed)}</td>
                    <td>{fmtDate(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── Notes ──────────────────────────────────────────────────────── */}
        <section className={styles.noteBox}>
          <p><strong>Notes</strong></p>
          <ul>
            <li>Grades = number of &ldquo;Grade This Submission&rdquo; actions executed this billing period.</li>
            <li>API cost estimate: ~$0.009/grade (Claude Sonnet input + output, avg ~4K tokens/grade).</li>
            <li>MRR does not account for annual plans, discounts, or refunds.</li>
            <li>Usage resets at <code>period_start</code> each month (set by Stripe webhook on renewal).</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
