// app/faq/page.tsx — FAQ page

import Link from 'next/link';
import styles from '../privacy/legal.module.css';

export const metadata = {
  title: 'FAQ',
  description: 'Frequently asked questions about Katana — the AI grading assistant for Canvas SpeedGrader.',
  alternates: { canonical: 'https://www.gradewithkatana.com/faq' },
};

export default function FaqPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.logo}>⚔️ Katana</Link>
        <Link href="/" className={styles.backLink}>← Back to home</Link>
      </nav>

      <main className={styles.main}>
        <h1 className={styles.title}>FAQ</h1>
        <p className={styles.meta}>gradewithkatana.com</p>

        <section className={styles.section}>
          <h2>What is Katana?</h2>
          <p>
            Katana is a Google Chrome extension that opens alongside Canvas SpeedGrader.
            When you click <strong>&quot;Grade This Submission&quot;</strong>, Katana reads
            the submission text, assignment instructions, and rubric from the page —
            then uses Claude AI to generate a grade, rubric ratings, and written feedback.
            Everything is filled into Canvas automatically. You review, edit if needed, and click Submit.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Does Katana store student work?</h2>
          <p>
            No. Submission content is processed in real time and immediately discarded.
            Nothing is written to a database or log file. See our{' '}
            <Link href="/privacy">Privacy Policy</Link> for the full details.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Does it work with any Canvas course?</h2>
          <p>
            Yes — Katana works directly in the Canvas SpeedGrader browser page.
            There is no Canvas API integration, no LTI setup, and no IT department involvement.
            If you can open SpeedGrader in Google Chrome, Katana works.
          </p>
        </section>

        <section className={styles.section}>
          <h2>What browsers are supported?</h2>
          <p>
            Google Chrome is required. Firefox and Safari support is on the roadmap.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Does Katana work with Blackboard or Brightspace?</h2>
          <p>
            Not yet — Katana is currently built exclusively for Canvas SpeedGrader.
            If there&apos;s enough demand for other LMS platforms, we&apos;ll consider adding support.
            Let us know at{' '}
            <a href="mailto:hello@gradewithkatana.com">hello@gradewithkatana.com</a> if
            that&apos;s something you&apos;d find useful.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Does Katana support using AI to replace the instructor&apos;s judgment?</h2>
          <p>
            Absolutely not — and that&apos;s not what we built it for.
            Katana is a <strong>starting point</strong>, not a replacement.
            It drafts a grade and feedback that reflects your rubric and your voice,
            so you spend less time on the mechanical parts of grading and more time
            on the parts that actually require your expertise.
          </p>
          <p>
            Katana never submits anything to Canvas on its own.
            Every grade goes through you first. We actively encourage instructors
            to read, edit, and personalize each AI-generated response before hitting Submit.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Does Katana automatically submit grades to Canvas?</h2>
          <p>
            No — and that&apos;s by design. Katana fills in the grade, rubric ratings,
            and feedback as a draft for you to review. The Submit button in Canvas
            is always the instructor&apos;s to click. You are in control at every step.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Does Katana work with the Canvas mobile app?</h2>
          <p>
            Unfortunately, no. Katana is a Chrome extension that runs in your desktop browser
            alongside SpeedGrader. It can&apos;t be installed on a phone or tablet, and it
            doesn&apos;t have access to the Canvas mobile app. You&apos;ll need Google Chrome
            on a Mac or PC to use it.
          </p>
        </section>

        <section className={styles.section}>
          <h2>What operating systems does Katana support?</h2>
          <p>
            Any operating system that runs Google Chrome — Windows, macOS, and Linux all work.
            If Chrome is installed, Katana is installed.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Will my school&apos;s IT department know I&apos;m using Katana?</h2>
          <p>
            No. Katana runs entirely inside your browser window and interacts with SpeedGrader
            exactly the way you would if you were filling in grades and feedback by hand.
            It makes no calls to Canvas&apos;s servers and leaves no footprint that differs
            from normal instructor activity.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Questions?</h2>
          <p>
            Email us at{' '}
            <a href="mailto:hello@gradewithkatana.com">hello@gradewithkatana.com</a>.
            We respond quickly.
          </p>
        </section>
      </main>

      <footer className={styles.footer}>
        <Link href="/">← Back to Katana</Link>
        <span>·</span>
        <Link href="/privacy">Privacy Policy</Link>
        <span>·</span>
        <Link href="/terms">Terms of Use</Link>
      </footer>
    </div>
  );
}
