// app/page.tsx — Landing page

import Link from 'next/link';
import styles from './page.module.css';

export default function LandingPage() {
  return (
    <main className={styles.main}>
      {/* ── Nav ────────────────────────────────────── */}
      <nav className={styles.nav}>
        <div className={styles.logo}>⚔️ Katana</div>
        <div className={styles.navLinks}>
          <Link href="#pricing">Pricing</Link>
          <Link href="/auth/signin" className={styles.btnNav}>Sign In</Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────── */}
      <section className={styles.hero}>
        <h1 className={styles.heroTitle}>
          Grade Canvas submissions<br />in seconds with AI.
        </h1>
        <p className={styles.heroSub}>
          Katana reads submissions, applies your rubric, and fills in grades and feedback — you just review and submit.
        </p>
        <Link href="/auth/signup" className={styles.btnHero}>
          Start Free Trial
        </Link>
        <p className={styles.heroNote}>No credit card required · 50 free grades/month</p>
      </section>

      {/* ── Features ─────────────────────────────────── */}
      <section className={styles.features}>
        {[
          { icon: '⚡', title: 'One-click grading', desc: 'Click Grade in the side panel, and Katana fills in the score, rubric, and feedback automatically.' },
          { icon: '📋', title: 'Rubric-aware', desc: 'Reads your Canvas rubric directly from the API and scores each criterion precisely.' },
          { icon: '🎨', title: 'Your voice', desc: 'Choose from Professional, Encouraging, Socratic, Samurai, and more tone profiles.' },
          { icon: '🔒', title: 'No data stored', desc: 'Submissions are processed in real-time and never stored on our servers.' },
        ].map(f => (
          <div key={f.title} className={styles.featureCard}>
            <div className={styles.featureIcon}>{f.icon}</div>
            <h3 className={styles.featureTitle}>{f.title}</h3>
            <p className={styles.featureDesc}>{f.desc}</p>
          </div>
        ))}
      </section>

      {/* ── Pricing ──────────────────────────────────── */}
      <section id="pricing" className={styles.pricing}>
        <h2 className={styles.sectionTitle}>Simple pricing</h2>
        <div className={styles.plans}>
          {[
            {
              name: 'Free',
              price: '$0',
              per: '/month',
              features: ['50 grades / month', 'Claude Sonnet', 'All tone profiles', 'Rubric support'],
              cta: 'Get Started Free',
              href: '/auth/signup',
              highlight: false,
            },
            {
              name: 'Pro',
              price: '$12',
              per: '/month',
              features: ['Unlimited grades', 'Claude Opus access', 'Priority processing', 'Email support'],
              cta: 'Start Pro Trial',
              href: '/auth/signup?plan=pro',
              highlight: true,
            },
            {
              name: 'Department',
              price: 'Custom',
              per: '',
              features: ['Multiple instructors', 'Admin dashboard', 'SSO / LTI integration', 'Dedicated support'],
              cta: 'Contact Us',
              href: 'mailto:hello@katana.app',
              highlight: false,
            },
          ].map(plan => (
            <div key={plan.name} className={`${styles.planCard} ${plan.highlight ? styles.planHighlight : ''}`}>
              <div className={styles.planName}>{plan.name}</div>
              <div className={styles.planPrice}>{plan.price}<span className={styles.planPer}>{plan.per}</span></div>
              <ul className={styles.planFeatures}>
                {plan.features.map(f => <li key={f}>{f}</li>)}
              </ul>
              <Link href={plan.href} className={plan.highlight ? styles.btnHero : styles.btnOutline}>
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────── */}
      <footer className={styles.footer}>
        <p>⚔️ Katana · <a href="mailto:hello@katana.app">hello@katana.app</a></p>
        <p><Link href="/privacy">Privacy</Link> · <Link href="/terms">Terms</Link></p>
      </footer>
    </main>
  );
}
