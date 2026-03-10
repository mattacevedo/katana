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
          <h2>Why use Katana?</h2>
          <p>
            Meaningful, substantive feedback is one of the most valuable things an instructor
            can give a student. We&apos;ve all experienced the other kind — a number at the
            top of the page with no explanation of what worked, what didn&apos;t, or how to
            improve. That kind of feedback doesn&apos;t teach much.
          </p>
          <p>
            The problem is that writing real feedback takes time — often more time than
            instructors have, especially across large classes. Katana is built to close that
            gap. It gives you a thoughtful first draft that reflects your rubric and your
            grading standards, so you can focus your energy on refining and personalizing
            rather than starting from scratch for every submission.
          </p>
        </section>

        <section className={styles.section}>
          <h2>What&apos;s the difference between the plans?</h2>
          <p>
            Only one thing: the number of submissions you can grade per month.
            Every plan uses the same AI model, produces the same quality of feedback, and
            has access to all of Katana&apos;s features. There are no premium tiers with
            better results — we didn&apos;t think that would be fair.
          </p>
          <p>
            The free plan (50 grades/month) works well for smaller classes or for trying
            Katana out before committing. Paid plans are for instructors grading at higher volume.
          </p>
        </section>

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
            No. When you grade a submission, the text is sent to Anthropic&apos;s Claude API
            to generate the grade and feedback — that&apos;s the AI step. Neither Katana nor
            Anthropic stores or logs that content. Anthropic does not use API inputs to train
            their models. Nothing is written to Katana&apos;s own servers or databases.
            See our <Link href="/privacy">Privacy Policy</Link> for the full details.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Does it work with any Canvas course?</h2>
          <p>
            Yes — Katana works directly in the Canvas SpeedGrader browser page.
            Katana works entirely through your browser — no LTI setup, no OAuth integration, no backend connection to Canvas, and no IT department involvement.
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
            If Chrome is installed, Katana can be installed.
          </p>
        </section>

        <section className={styles.section}>
          <h2>Will my school&apos;s IT department know I&apos;m using Katana?</h2>
          <p>
            From Canvas&apos;s perspective, Katana is invisible. SpeedGrader activity looks
            identical to an instructor filling in grades by hand — Canvas&apos;s own servers
            have no knowledge of Katana. The one external call Katana makes is to
            Anthropic&apos;s API (the AI service that generates the grade and feedback),
            which is entirely separate from Canvas.
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
