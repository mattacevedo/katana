// app/terms/page.tsx — Terms of Use

import Link from 'next/link';
import styles from '../privacy/legal.module.css';

export const metadata = {
  title: 'Terms of Use',
  description: 'Terms of use for Katana, the AI grading assistant Chrome extension for Canvas SpeedGrader.',
  alternates: { canonical: 'https://www.gradewithkatana.com/terms' },
  robots: { index: true, follow: true },
};

export default function TermsPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.logo}>⚔️ Katana</Link>
        <Link href="/" className={styles.backLink}>← Back to home</Link>
      </nav>

      <main className={styles.main}>
        <h1 className={styles.title}>Terms of Use</h1>
        <p className={styles.meta}>Effective date: March 9, 2026 · gradewithkatana.com</p>

        <div className={styles.highlight}>
          <strong>Plain-language summary:</strong> Katana is a tool for educators. Use it
          to help grade your own students&apos; work. Don&apos;t misuse it, share your account,
          or use it in ways that harm others. We don&apos;t store student submissions.
          You can cancel anytime. We may update these terms with notice.
        </div>

        <section className={styles.section}>
          <h2>1. Acceptance</h2>
          <p>
            By creating a Katana account or using the Katana Chrome extension (&quot;Service&quot;),
            you agree to these Terms of Use. If you do not agree, do not use the Service.
            These terms apply to individual users. If you are using Katana on behalf of an
            institution, you also represent that you have authority to bind that institution.
          </p>
        </section>

        <section className={styles.section}>
          <h2>2. The Service</h2>
          <p>
            Katana is an AI-assisted grading tool that operates as a Google Chrome extension.
            It reads student submissions from Canvas SpeedGrader pages open in your browser,
            uses AI to generate grades and feedback based on your rubric and settings,
            and fills those results into Canvas for your review.
          </p>
          <p>
            <strong>Google Chrome is required.</strong> Katana operates exclusively within
            Google Chrome. Support for additional browsers may be added in the future.
          </p>
          <p>
            Katana is not affiliated with, endorsed by, or integrated into Instructure/Canvas.
            It operates independently in your browser without any Canvas platform integration.
          </p>
        </section>

        <section className={styles.section}>
          <h2>3. Accounts</h2>
          <ul>
            <li>You must provide a valid email address to create an account.</li>
            <li>You are responsible for maintaining the security of your account.</li>
            <li>Accounts are for individual use. You may not share your account credentials.</li>
            <li>You may not create accounts on behalf of others without their permission.</li>
            <li>We may suspend or terminate accounts that violate these terms.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>4. Acceptable Use</h2>
          <p>You agree to use Katana only for legitimate educational grading purposes. You agree <strong>not</strong> to:</p>
          <ul>
            <li>Use the Service to grade work other than your own students&apos; submissions</li>
            <li>Attempt to reverse-engineer, scrape, or extract data from the Service</li>
            <li>Circumvent usage limits or billing systems</li>
            <li>Use the Service for any illegal purpose</li>
            <li>Submit content that violates applicable law or third-party rights</li>
            <li>Use the Service in a way that harms students or misrepresents grades</li>
          </ul>
          <p>
            <strong>Instructor responsibility:</strong> Katana generates AI-assisted grade
            suggestions. You are solely responsible for reviewing, adjusting, and submitting
            all final grades. Katana&apos;s output is a starting point, not a final determination.
          </p>
        </section>

        <section className={styles.section}>
          <h2>5. AI Outputs and Limitations</h2>
          <p>
            Katana uses AI to assist with grading. AI outputs may be inaccurate, incomplete,
            or inappropriate. You acknowledge that:
          </p>
          <ul>
            <li>AI-generated grades and feedback should always be reviewed by a human instructor before submission.</li>
            <li>You are responsible for any grade you submit in Canvas, regardless of Katana&apos;s suggestion.</li>
            <li>Katana does not guarantee accuracy, fairness, or consistency of AI outputs.</li>
            <li>Results may vary based on submission clarity, rubric quality, and assignment instructions.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>6. Privacy and Student Data</h2>
          <p>
            Our handling of student submission data is governed by our{' '}
            <Link href="/privacy">Privacy Policy</Link>, which is incorporated
            into these Terms by reference. Key points:
          </p>
          <ul>
            <li>Student submissions are processed in real time and not retained.</li>
            <li>No student data is used to train AI models.</li>
            <li>You are responsible for ensuring your use of Katana complies with your
              institution&apos;s policies and applicable privacy laws (including FERPA).</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>7. Plans, Billing, and Cancellation</h2>
          <h3>Free plan</h3>
          <p>
            The Free plan includes 50 grades per month at no charge. No credit card is required.
          </p>
          <h3>Paid plans</h3>
          <p>
            Paid plans are billed monthly. Your subscription renews automatically each month
            until you cancel. You may cancel at any time through your account dashboard or by
            contacting <a href="mailto:hello@gradewithkatana.com">hello@gradewithkatana.com</a>.
          </p>
          <p>
            Cancellation takes effect at the end of the current billing period. You retain
            access to paid features until that date. We do not offer refunds for partial
            billing periods.
          </p>
          <h3>Add-on grade packs</h3>
          <p>
            Add-on packs (100 grades for $5) are one-time purchases and are non-refundable
            once any grades from the pack have been used.
          </p>
          <h3>Plan changes</h3>
          <p>
            You may upgrade or downgrade your plan at any time. Upgrades take effect immediately.
            Downgrades take effect at the start of your next billing period.
          </p>
        </section>

        <section className={styles.section}>
          <h2>8. Intellectual Property</h2>
          <p>
            The Katana software, branding, and website are owned by <strong>Tamahagane, LLC</strong> and
            are protected by intellectual property law. You retain all rights to your students&apos; submissions
            and to grades and feedback you submit in Canvas.
          </p>
          <p>
            You grant us a limited, non-exclusive license to process submission data solely
            as necessary to provide the grading service to you.
          </p>
        </section>

        <section className={styles.section}>
          <h2>9. Disclaimer of Warranties</h2>
          <p>
            THE SERVICE IS PROVIDED &quot;AS IS&quot; WITHOUT WARRANTY OF ANY KIND. WE DO NOT WARRANT
            THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR THAT AI OUTPUTS WILL BE
            ACCURATE OR APPROPRIATE FOR ANY PARTICULAR PURPOSE. YOUR USE OF THE SERVICE IS
            AT YOUR OWN RISK.
          </p>
        </section>

        <section className={styles.section}>
          <h2>10. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, TORABASHIRI, LLC SHALL NOT BE LIABLE FOR ANY
            INDIRECT, INCIDENTAL, SPECIAL, OR CONSEQUENTIAL DAMAGES ARISING FROM YOUR USE
            OF THE SERVICE, INCLUDING ANY GRADING ERRORS OR DECISIONS MADE BASED ON
            AI-GENERATED OUTPUT. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID
            IN THE 3 MONTHS PRECEDING THE CLAIM.
          </p>
        </section>

        <section className={styles.section}>
          <h2>11. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. We will notify you by email of
            material changes at least 14 days before they take effect. Continued use of
            the Service after the effective date constitutes acceptance of the updated Terms.
          </p>
        </section>

        <section className={styles.section}>
          <h2>12. Governing Law</h2>
          <p>
            These Terms are governed by the laws of the United States and the state of
            incorporation of Tamahagane, LLC, without regard to conflict of law provisions.
          </p>
        </section>

        <section className={styles.section}>
          <h2>13. Contact</h2>
          <p>
            Questions about these Terms:
            <br /><a href="mailto:hello@gradewithkatana.com">hello@gradewithkatana.com</a>
            <br />Tamahagane, LLC · gradewithkatana.com
          </p>
        </section>
      </main>

      <footer className={styles.footer}>
        <Link href="/">← Back to Katana</Link>
        <span>·</span>
        <Link href="/privacy">Privacy Policy</Link>
        <span>·</span>
        <Link href="/faq">FAQ</Link>
      </footer>
    </div>
  );
}
