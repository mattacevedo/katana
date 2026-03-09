// app/page.tsx — Landing page

import Link from 'next/link';
import styles from './page.module.css';

export default function LandingPage() {
  return (
    <main className={styles.main}>

      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav className={styles.nav}>
        <div className={styles.logoGroup}>
          <div className={styles.logo}>⚔️ Katana</div>
          <div className={styles.logoTagline}>Slice through your grading workload</div>
        </div>
        <div className={styles.navLinks}>
          <Link href="#how-it-works">How It Works</Link>
          <Link href="#pricing">Pricing</Link>
          <Link href="/fyi">FYI</Link>
          <Link href="/dashboard" className={styles.btnNavSecondary}>My Account</Link>
          <Link href="/auth/signin" className={styles.btnNav}>Sign In</Link>
        </div>
      </nav>

      {/* ── Hero ────────────────────────────────────────────────────────── */}
      <section className={styles.hero}>
        <div className={styles.heroBadge}>🎓 Built by university professors</div>

        <h1 className={styles.heroTitle}>
          Grade 10× faster — right inside Canvas.
        </h1>
        <p className={styles.heroSub}>
          Katana is a <strong>Google Chrome extension</strong> that opens alongside Canvas SpeedGrader
          — no IT department required, no Canvas integration.
          Click <strong>&quot;Grade This Submission&quot;</strong> and AI fills in the score,
          rubric ratings, and personalized feedback. You just review and hit Submit.
        </p>

        <Link href="/auth/signup" className={styles.btnHero}>
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
                <div className={styles.demoCanvasHeader}>
                  <span className={styles.demoCanvasTitle}>SpeedGrader</span>
                  <span className={styles.demoCanvasAssign}>Essay #3: Climate Policy Analysis</span>
                </div>
                <div className={styles.demoCanvasStudent}>👤 Jane Smith</div>
                <div className={styles.demoSubmissionPreview}>
                  <p>The 2015 Paris Agreement established a framework for...</p>
                  <p className={styles.demoSubmissionFade}>Nations committed to limiting warming to 1.5°C above...</p>
                </div>
                <div className={styles.demoGradeRow}>
                  <label className={styles.demoGradeLabel}>Grade</label>
                  <div className={styles.demoGradeBox}>
                    <span className={styles.demoGradeValue}>92</span>
                    <span className={styles.demoGradeMax}> / 100</span>
                  </div>
                </div>
                <div className={styles.demoFeedbackBox}>
                  <div className={styles.demoFeedbackLabel}>Feedback</div>
                  <div className={styles.demoFeedbackText}>
                    Your thesis is clearly articulated and supported by
                    specific examples from the Paris Agreement. The policy
                    analysis in section 2 is particularly strong...
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
                  <p className={styles.demoLoadingSub}>Reading rubric &amp; submission</p>
                </div>

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
          <br /><span style={{fontSize:'13px', color:'#9ca3af'}}>(Google Chrome required · Support for other browsers coming soon)</span>
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
              Katana reads the submission and your rubric, then generates a grade,
              rubric ratings, and personalized written feedback in seconds.
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
            title: 'Rubric-aware',
            desc: 'Reads your assignment rubric and scores each criterion precisely — just like a careful human grader would.',
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
          We are FERPA-aware and GDPR-ready. A Data Processing Agreement (DPA)
          is available for institutions that require one.
        </p>
        <div className={styles.privacyBadges}>
          <span className={styles.badge}>🔒 TLS encrypted</span>
          <span className={styles.badge}>🚫 Zero storage</span>
          <span className={styles.badge}>📚 FERPA-aware</span>
          <span className={styles.badge}>🌍 GDPR-ready</span>
          <span className={styles.badge}>🛡️ No AI training</span>
          <span className={styles.badge}>📄 DPA available</span>
        </div>
        <Link href="/privacy" className={styles.privacyLink}>
          Read our full Privacy Policy →
        </Link>
      </section>

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
                'Claude Sonnet AI',
                'All tone profiles',
                'Rubric support',
                'Personalized feedback',
              ],
              cta: 'Get Started Free',
              href: '/auth/signup',
              highlight: false,
              badge: null,
            },
            {
              name: 'Basic',
              price: '$5',
              per: '/month',
              grades: '200 grades / month',
              features: [
                'Claude Sonnet AI',
                'All tone profiles',
                'Rubric support',
                'Personalized feedback',
              ],
              cta: 'Start Basic',
              href: '/auth/signup?plan=basic',
              highlight: false,
              badge: null,
            },
            {
              name: 'Super',
              price: '$20',
              per: '/month',
              grades: '1,000 grades / month',
              features: [
                'Claude Sonnet AI',
                'All tone profiles',
                'Rubric support',
                'Personalized feedback',
              ],
              cta: 'Start Super',
              href: '/auth/signup?plan=super',
              highlight: true,
              badge: 'Most Popular',
            },
            {
              name: 'Shogun',
              price: '$50',
              per: '/month',
              grades: '2,500 grades / month',
              features: [
                'Claude Sonnet AI',
                'All tone profiles',
                'Rubric support',
                'Personalized feedback',
              ],
              cta: 'Start Shogun',
              href: '/auth/signup?plan=shogun',
              highlight: false,
              badge: 'Best for departments',
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
          <Link href="/fyi">FYI</Link>
        </div>
      </footer>

    </main>
  );
}
