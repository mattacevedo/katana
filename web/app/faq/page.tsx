// app/faq/page.tsx — FAQ page

import Link from 'next/link';
import styles from '../privacy/legal.module.css';

export const metadata = { title: 'FAQ — Katana' };

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

        <div className={styles.highlight}>
          <strong>More content coming soon.</strong> This page will answer your most common
          questions about Katana — how it works, what it reads, and what you can trust it to do.
        </div>

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
