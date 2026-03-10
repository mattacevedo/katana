// app/page.tsx — Landing page

import type { Metadata } from 'next';
import Link from 'next/link';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Katana — AI Grading Assistant for Canvas SpeedGrader',
  description:
    'A Google Chrome extension that grades student essays and reports in Canvas SpeedGrader with AI. One click fills in the score, rubric ratings, and written feedback. 50 free grades/month.',
  alternates: { canonical: 'https://www.gradewithkatana.com' },
  openGraph: { url: 'https://www.gradewithkatana.com' },
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Katana',
  applicationCategory: 'EducationalApplication',
  operatingSystem: 'Google Chrome',
  url: 'https://www.gradewithkatana.com',
  description:
    'AI grading assistant for Canvas SpeedGrader. Grades student essays and reports with one click — auto-fills score, rubric ratings, and written feedback.',
  offers: [
    { '@type': 'Offer', price: '0', priceCurrency: 'USD', name: 'Free – 50 grades/month' },
    { '@type': 'Offer', price: '5', priceCurrency: 'USD', name: 'Basic – 200 grades/month' },
    { '@type': 'Offer', price: '20', priceCurrency: 'USD', name: 'Super – 1,000 grades/month' },
    { '@type': 'Offer', price: '50', priceCurrency: 'USD', name: 'Shogun – 2,500 grades/month' },
  ],
  author: { '@type': 'Organization', name: 'Tamahagane, LLC', url: 'https://www.gradewithkatana.com' },
};

export default function LandingPage() {
  return (
    <main className={styles.main}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className={styles.nav}>
        <div className={styles.logoGroup}>
          <div className={styles.logo}>⚔️ Katana</div>
          <div className={styles.logoTagline}>Slice through your grading workload</div>
        </div>
        <div className={styles.navLinks}>
          <Link href="#how-it-works">How It Works</Link>
          <Link href="#pricing">Pricing</Link>
          <Link href="/faq">FAQ</Link>
          <Link href="/dashboard" className={styles.btnNavSecondary}>My Account</Link>
          <Link href="/auth/signin" className={styles.btnNav}>Sign In</Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroBadge}>🎓 Built by university professors</div>

        <h1 className={styles.heroTitle}>
          Less grading. More teaching.
        </h1>
        <p className={styles.heroSub}>
          A <strong>Google Chrome extension</strong> that opens alongside Canvas SpeedGrader.
          Click <strong>&quot;Grade This Submission&quot;</strong> and AI grades the essay or report
          against your assignment instructions and rubric — then fills in the score, rubric ratings,
          and written feedback automatically. You review and submit. No IT department. No LTI setup or backend integration.
        </p>

        <Link href="/auth/signin" className={styles.btnHero}>
          Start Free
        </Link>
        <p className={styles.heroNote}>
          50 grades/month · No credit card required · Works in minutes
        </p>
        <p className={styles.heroAudience}>
          For college, university, and K–12 educators · Requires Google Chrome
        </p>

        {/* ── Animated Demo ─────────────────────────────────────────────── */}
        <div className={styles.demoWrapper}>
          <div className={styles.demoBrowser}>
            {/* Browser chrome bar */}
            <div className={styles.demoBrowserBar}>
              <span className={styles.demoDot} style={{ background: '#ff5f57' }} />
              <span className={styles.demoDot} style={{ background: '#febc2e' }} />
              <span className={styles.demoDot} style={{ background: '#28c840' }} />
              <span className={styles.demoUrl}>canvas.instructure.com / SpeedGrader</span>
            </div>

            <div className={styles.demoContent}>
              {/* Left: Canvas SpeedGrader */}
              <div className={styles.demoCanvas}>

                {/* Gray top bar — assignment name + student nav */}
                <div className={styles.demoSgHeader}>
                  <div className={styles.demoSgAssign}>Essay #3: Climate Policy Analysis</div>
                  <div className={styles.demoSgStudentRow}>
                    <span className={styles.demoSgArrow}>‹</span>
                    <span className={styles.demoSgAvatar}>JS</span>
                    <span className={styles.demoSgStudent}>Jane Smith</span>
                    <span className={styles.demoSgArrow}>›</span>
                  </div>
                </div>

                {/* Body: document viewer + grading panel */}
                <div className={styles.demoSgBody}>

                  {/* Document pane */}
                  <div className={styles.demoSgDoc}>
                    <div className={styles.demoSgToolbar}>
                      <span>◁ 1 / 55 ▷</span>
                    </div>
                    <div className={styles.demoSgPaper}>
                      <p className={styles.demoSgPaperTitle}>Climate Policy Analysis: The Paris Agreement</p>
                      <p className={styles.demoSgPaperText}>The 2015 Paris Agreement established a landmark framework for international climate cooperation. Nations committed to limiting warming to 1.5°C above pre-industrial levels, requiring significant emissions reductions from all signatories.</p>
                      <p className={`${styles.demoSgPaperText} ${styles.demoSgFade}`}>The policy implications for developing economies present a complex challenge that requires careful balancing of mitigation costs and adaptation needs...</p>
                    </div>
                  </div>

                  {/* Canvas grading panel */}
                  <div className={styles.demoSgGradePanel}>
                    <div className={styles.demoSgWordCount}>Word Count: 892</div>
                    <div className={styles.demoSgAssessLabel}>Assessment</div>
                    <div>
                      <div className={styles.demoSgFieldLabel}>Grade out of 100</div>
                      <div className={styles.demoSgInput}>92</div>
                    </div>
                    <div>
                      <div className={styles.demoSgFieldLabel}>Comments</div>
                      <div className={styles.demoSgCommentBox}>Your thesis is clearly articulated and supported by specific examples…</div>
                    </div>
                  </div>

                </div>
              </div>

              {/* Right: Katana panel */}
              <div className={styles.demoPanel}>
                <div className={styles.demoPanelHeader}>⚔️ Katana</div>

                <div className={styles.demoPanelStudent}>Jane Smith</div>
                <div className={styles.demoPanelAssign}>Essay #3</div>

                {/* Idle state */}
                <div className={`${styles.demoState} ${styles.demoStateIdle}`}>
                  <button className={styles.demoBtnGrade}>
                    ⚡ Grade This Submission
                  </button>
                  <p className={styles.demoBtnHint}>AI will fill in Canvas automatically.</p>
                </div>

                {/* Loading state */}
                <div className={`${styles.demoState} ${styles.demoStateLoading}`}>
                  <div className={styles.demoSpinner} />
                  <p className={styles.demoLoadingText}>Analyzing submission…</p>
                  <p className={styles.demoLoadingSub}>Reading instructions &amp; rubric</p>
                </div>

                {/* Animated cursor — Mac-style pointer SVG */}
                <svg
                  className={styles.demoCursor}
                  aria-hidden="true"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 28 28"
                >
                  <polygon fill="#FFFFFF" points="8.2,20.9 8.2,4.9 19.8,16.5 13,16.5 12.6,16.6" />
                  <polygon fill="#FFFFFF" points="17.3,21.6 13.7,23.1 9,12 12.7,10.5" />
                  <rect x="12.5" y="13.6" transform="matrix(0.9221 -0.3871 0.3871 0.9221 -5.7605 6.5909)" width="2" height="8" />
                  <polygon points="9.2,7.3 9.2,18.5 12.2,15.6 12.6,15.5 17.4,15.5" />
                </svg>

                {/* Result state */}
                <div className={`${styles.demoState} ${styles.demoStateResult}`}>
                  <div className={styles.demoResultGradeRow}>
                    <span className={styles.demoResultGrade}>92 / 100</span>
                    <span className={styles.demoResultBadge}>High Confidence</span>
                  </div>
                  <div className={styles.demoResultFeedbackBox}>
                    Your thesis is clearly articulated and supported…
                  </div>
                  <div className={styles.demoActionHint}>
                    ✏️ Review in Canvas, then click Submit.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust bar ───────────────────────────────────────────────────── */}
      <div className={styles.trustBar}>
        <span>🎓 Built by professors</span>
        <span className={styles.trustDivider}>·</span>
        <span>🏫 K–12 &amp; higher ed</span>
        <span className={styles.trustDivider}>·</span>
        <span>🔒 FERPA-aware</span>
        <span className={styles.trustDivider}>·</span>
        <span>🌍 GDPR-ready</span>
        <span className={styles.trustDivider}>·</span>
        <span>🚫 Zero data storage</span>
        <span className={styles.trustDivider}>·</span>
        <span>🛡️ Never used to train AI</span>
      </div>

      {/* ── How it works ────────────────────────────────────────────────── */}
      <section id="how-it-works" className={styles.howItWorks}>
        <h2 className={styles.sectionTitle}>How it works</h2>
        <p className={styles.sectionSub}>
          Katana is a Google Chrome extension — nothing to configure in Canvas, no IT department
          to involve, no integrations to set up. Install in minutes and start grading.
          <br /><span style={{fontSize:'13px', color:'#9ca3af'}}>(Google Chrome required · Firefox and Safari support coming soon)</span>
        </p>
        <div className={styles.steps}>
          <div className={styles.step}>
            <div className={styles.stepNum}>1</div>
            <div className={styles.stepIcon}>🌐</div>
            <h3 className={styles.stepTitle}>Open Canvas SpeedGrader</h3>
            <p className={styles.stepDesc}>
              Navigate to any student submission in Canvas SpeedGrader. The Katana
              panel appears automatically on the right side of your browser.
            </p>
          </div>

          <div className={styles.stepArrow}>→</div>

          <div className={styles.step}>
            <div className={styles.stepNum}>2</div>
            <div className={styles.stepIcon}>⚡</div>
            <h3 className={styles.stepTitle}>Click &quot;Grade This Submission&quot;</h3>
            <p className={styles.stepDesc}>
              Katana reads your assignment instructions and the student&apos;s essay or report.
              If you have a rubric, it scores each criterion too. Grade and written feedback
              are generated in seconds.
            </p>
          </div>

          <div className={styles.stepArrow}>→</div>

          <div className={styles.step}>
            <div className={styles.stepNum}>3</div>
            <div className={styles.stepIcon}>✅</div>
            <h3 className={styles.stepTitle}>Review &amp; submit in Canvas</h3>
            <p className={styles.stepDesc}>
              The grade and feedback are filled into Canvas automatically.
              Make any edits you like, then click Submit. You&apos;re done.
            </p>
          </div>
        </div>
      </section>

      {/* ── Features ────────────────────────────────────────────────────── */}
      <section className={styles.features}>
        {[
          {
            icon: '⚡',
            title: 'One click, done',
            desc: 'Click "Grade This Submission" in the Katana side panel and AI fills in the score, rubric ratings, and written feedback automatically.',
          },
          {
            icon: '📋',
            title: 'Instructions & rubric aware',
            desc: 'Grades against your assignment instructions and rubric, scoring each criterion precisely. No rubric? Katana grades from your instructions alone.',
          },
          {
            icon: '🎨',
            title: 'Your voice',
            desc: 'Choose your feedback tone: Professional, Encouraging, Socratic, Skeptical, and more to match your teaching style.',
          },
          {
            icon: '🔧',
            title: 'Fully customizable',
            desc: 'Set grading strictness, feedback length, late-submission deductions, and custom instructions per assignment.',
          },
        ].map(f => (
          <div key={f.title} className={styles.featureCard}>
            <div className={styles.featureIcon}>{f.icon}</div>
            <h3 className={styles.featureTitle}>{f.title}</h3>
            <p className={styles.featureDesc}>{f.desc}</p>
          </div>
        ))}
      </section>

      {/* ── Privacy callout ──────────────────────────────────────────────── */}
      <section className={styles.privacyCallout}>
        <div className={styles.privacyIcon}>🛡️</div>
        <h2 className={styles.privacyTitle}>
          Nothing submitted is ever stored or used to train AI.
        </h2>
        <p className={styles.privacyBody}>
          Katana processes each submission in real time through an encrypted connection,
          generates the grade and feedback, then immediately discards the content.
          Student work is never retained on our servers, never sold, and never used
          to train or improve any AI model — period.
        </p>
        <p className={styles.privacyBody}>
          We are FERPA-aware and GDPR-ready.
        </p>
        <div className={styles.privacyBadges}>
          <span className={styles.badge}>🔒 TLS encrypted</span>
          <span className={styles.badge}>🚫 Zero storage</span>
          <span className={styles.badge}>📚 FERPA-aware</span>
          <span className={styles.badge}>🌍 GDPR-ready</span>
          <span className={styles.badge}>🛡️ No AI training</span>
        </div>
        <Link href="/privacy" className={styles.privacyLink}>
          Read our full Privacy Policy →
        </Link>
      </section>

      {/*
        TODO: Promo code feature
        Give new users a free month on the Basic plan via a promo code
        (e.g. distributed at conferences, to colleagues, on social media).

        Implementation via Stripe:
        1. Create a Stripe Coupon: 100% off, duration = 1 month, applies to Basic plan only.
        2. Generate Promotion Codes from that coupon (e.g. WELCOME, PROF50, CANVAS24).
           Each code can be single-use or multi-use, with optional expiry.
        3. At checkout, add a "Have a promo code?" input field on the Stripe checkout session.
           Pass the code via `discounts: [{ promotion_code: <id> }]` on the
           Stripe Checkout Session or Subscription creation API call.
        4. Stripe validates the code, applies the discount, and handles billing automatically.
           No custom validation logic needed on our end.

        UI: Add a small "Have a promo code?" link below the pricing cards that expands
        an input. On submit, redirect to /auth/signin?plan=basic&promo=CODE so the
        checkout flow can pick it up post-sign-in.
      */}

      {/* ── Pricing ─────────────────────────────────────────────────────── */}
      <section id="pricing" className={styles.pricing}>
        <h2 className={styles.sectionTitle}>Straightforward, honest pricing</h2>
        <p className={styles.sectionSub}>
          All plans include Claude Sonnet AI, every tone profile, rubric support,
          and personalized feedback. No hidden fees.
        </p>

        <div className={styles.plans}>
          {[
            {
              name: 'Free',
              price: '$0',
              per: '/month',
              grades: '50 grades / month',
              features: [
                'Essay & report grading',
                'All tone profiles',
                'Rubric support',
                'Personalized feedback',
              ],
              cta: 'Get Started Free',
              href: '/auth/signin',
              highlight: false,
              badge: null,
            },
            {
              name: 'Basic',
              price: '$5',
              per: '/month',
              grades: '200 grades / month',
              features: [
                'Essay & report grading',
                'All tone profiles',
                'Rubric support',
                'Personalized feedback',
              ],
              cta: 'Start Basic',
              href: '/auth/signin?plan=basic',
              highlight: false,
              badge: null,
            },
            {
              name: 'Super',
              price: '$20',
              per: '/month',
              grades: '1,000 grades / month',
              features: [
                'Essay & report grading',
                'All tone profiles',
                'Rubric support',
                'Personalized feedback',
              ],
              cta: 'Start Super',
              href: '/auth/signin?plan=super',
              highlight: true,
              badge: 'Most Popular',
            },
            {
              name: 'Shogun',
              price: '$50',
              per: '/month',
              grades: '2,500 grades / month',
              features: [
                'Essay & report grading',
                'All tone profiles',
                'Rubric support',
                'Personalized feedback',
              ],
              cta: 'Start Shogun',
              href: '/auth/signin?plan=shogun',
              highlight: false,
              badge: 'Large classes & high teaching load',
            },
          ].map(plan => (
            <div
              key={plan.name}
              className={`${styles.planCard} ${plan.highlight ? styles.planHighlight : ''}`}
            >
              {plan.badge && (
                <div className={styles.planBadge}>{plan.badge}</div>
              )}
              <div className={styles.planName}>{plan.name}</div>
              <div className={styles.planPrice}>
                {plan.price}<span className={styles.planPer}>{plan.per}</span>
              </div>
              <div className={styles.planGrades}>{plan.grades}</div>
              <ul className={styles.planFeatures}>
                {plan.features.map(f => <li key={f}>{f}</li>)}
              </ul>
              <Link
                href={plan.href}
                className={plan.highlight ? styles.btnHero : styles.btnOutline}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <div className={styles.addOnBox}>
          <span className={styles.addOnIcon}>📦</span>
          <div>
            <strong>Need a little more?</strong> Add 100 grades to any plan for $5.
            Buy as many packs as you need, whenever you need them.
          </div>
        </div>

        <p className={styles.cancelNote}>
          No contracts. No commitments. Cancel or change plans anytime.
        </p>
      </section>

      {/* ── Professor section ────────────────────────────────────────────── */}
      <section className={styles.professorSection}>
        <div className={styles.professorCard}>
          <div className={styles.professorIcon}>🎓</div>
          <p className={styles.professorQuote}>
            Katana was created by university professors who know what it feels like
            to spend evenings grading hundreds of submissions. We built the tool
            we wished we had — one that respects your judgment, matches your voice,
            and gets out of your way.
          </p>
          <p className={styles.professorSub}>— The Katana Team</p>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer className={styles.footer}>
        <div className={styles.footerLeft}>
          <span className={styles.footerLogo}>⚔️ Katana</span>
          <span>·</span>
          <a href="mailto:hello@gradewithkatana.com">hello@gradewithkatana.com</a>
          <span>·</span>
          <a href="https://gradewithkatana.com">gradewithkatana.com</a>
        </div>
        <div className={styles.footerRight}>
          <Link href="/privacy">Privacy Policy</Link>
          <span>·</span>
          <Link href="/terms">Terms of Use</Link>
          <span>·</span>
          <Link href="/faq">FAQ</Link>
        </div>
        <div className={styles.footerCopy}>
          © 2026 Tamahagane, LLC
        </div>
      </footer>

    </main>
  );
}
