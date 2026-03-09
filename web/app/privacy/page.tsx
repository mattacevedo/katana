// app/privacy/page.tsx — Privacy Policy

import Link from 'next/link';
import styles from './legal.module.css';

export const metadata = { title: 'Privacy Policy — Katana' };

export default function PrivacyPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.nav}>
        <Link href="/" className={styles.logo}>⚔️ Katana</Link>
        <Link href="/" className={styles.backLink}>← Back to home</Link>
      </nav>

      <main className={styles.main}>
        <h1 className={styles.title}>Privacy Policy</h1>
        <p className={styles.meta}>Effective date: March 9, 2026 · gradewithkatana.com</p>

        <div className={styles.highlight}>
          <strong>The short version:</strong> We process student submissions in real time to generate
          grades and feedback. We do not store submissions, grades, or feedback on our servers after
          processing. We never use student work to train AI models. We never sell your data.
        </div>

        <section className={styles.section}>
          <h2>1. Who We Are</h2>
          <p>
            Katana (&quot;we,&quot; &quot;us,&quot; or &quot;our&quot;) is an AI-assisted grading tool available as a Google
            Chrome extension, operated by <strong>Torabashiri, LLC</strong> at
            <strong> gradewithkatana.com</strong>. Katana was created by university professors.
            Questions about this policy: <a href="mailto:hello@gradewithkatana.com">hello@gradewithkatana.com</a>.
          </p>
        </section>

        <section className={styles.section}>
          <h2>2. What Data We Collect</h2>

          <h3>Account information</h3>
          <p>
            When you create an account, we collect your <strong>email address</strong>. We use
            passwordless authentication (magic links); no password is ever stored.
          </p>

          <h3>Usage data</h3>
          <p>
            We track the <strong>number of grades used per billing period</strong> per account
            so we can enforce plan quotas. We do not log the content of those grades.
          </p>

          <h3>Submission data (processed, not stored)</h3>
          <p>
            When you click &quot;Grade This Submission,&quot; the Katana Chrome extension reads the
            student&apos;s submission text, assignment instructions, and rubric from the Canvas
            SpeedGrader page currently open in your browser. This data is transmitted securely
            to our grading API, forwarded to Anthropic&apos;s Claude AI service to generate a grade
            and feedback, and then <strong>immediately discarded</strong>. We do not write
            submission content, student names, grades, or feedback to any database or log file.
          </p>

          <h3>What we do NOT collect</h3>
          <ul>
            <li>Student names, IDs, or contact information in any stored form</li>
            <li>Submission text after processing is complete</li>
            <li>Grades or feedback after they are returned to your browser</li>
            <li>Canvas credentials, cookies, or session tokens</li>
            <li>Browser history, other tab content, or any data unrelated to grading</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>3. No AI Training on Student Data</h2>
          <p>
            <strong>Student submissions, grades, and feedback are never used to train, fine-tune,
            or improve any AI model</strong> — including the Claude models provided by Anthropic.
            Our agreement with Anthropic prohibits use of API inputs for model training.
            We will never use student work for any commercial purpose beyond providing
            you with the grading result.
          </p>
        </section>

        <section className={styles.section}>
          <h2>4. How We Use Your Data</h2>
          <ul>
            <li><strong>Email address:</strong> To send you sign-in magic links and occasional
              service notices (e.g., billing changes, security alerts). We do not send marketing
              emails without your opt-in consent.</li>
            <li><strong>Grade counts:</strong> To enforce plan quotas and display your usage on
              the dashboard.</li>
            <li><strong>Submission data:</strong> Solely to call the Claude AI API and return a
              grading result to you. This data is not retained.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>5. Data Sharing and Subprocessors</h2>
          <p>
            We share data only as described below. We do not sell your data to any third party.
          </p>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Subprocessor</th>
                <th>Purpose</th>
                <th>Data shared</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><strong>Anthropic</strong> (Claude AI API)</td>
                <td>AI grading — generate grade and feedback</td>
                <td>Submission text, assignment instructions, rubric (in transit only; not retained)</td>
              </tr>
              <tr>
                <td><strong>Supabase</strong></td>
                <td>Authentication, account database</td>
                <td>Email address, grade count, plan type</td>
              </tr>
              <tr>
                <td><strong>Vercel</strong></td>
                <td>Web hosting and edge functions</td>
                <td>Standard server logs (IP, request metadata); no student content</td>
              </tr>
              <tr>
                <td><strong>Stripe</strong> <em>(when billing is active)</em></td>
                <td>Payment processing</td>
                <td>Billing name, email, payment method (handled directly by Stripe)</td>
              </tr>
            </tbody>
          </table>
          <p>
            All subprocessors are contractually bound to process data only as directed and to
            maintain appropriate security safeguards.
          </p>
        </section>

        <section className={styles.section}>
          <h2>6. FERPA Awareness</h2>
          <p>
            Katana is designed with FERPA (Family Educational Rights and Privacy Act,
            20 U.S.C. § 1232g) in mind. Specifically:
          </p>
          <ul>
            <li>We use student submission data solely to provide the grading service —
              no other commercial use.</li>
            <li>We do not disclose education records to any party not listed in the
              subprocessors table above.</li>
            <li>We do not retain student submission data after grading is complete.</li>
            <li>Student work is never used to train or improve any AI model.</li>
          </ul>
          <p>
            Instructors using Katana are responsible for ensuring their use of the tool
            complies with their institution&apos;s policies regarding third-party tools in grading.
            A Data Processing Agreement is available upon request for institutions that require one.
            Contact <a href="mailto:hello@gradewithkatana.com">hello@gradewithkatana.com</a>.
          </p>
        </section>

        <section className={styles.section}>
          <h2>7. GDPR Compliance (EEA and UK Users)</h2>
          <p>
            If you are located in the European Economic Area or the United Kingdom, the following
            applies to you under the General Data Protection Regulation (GDPR):
          </p>
          <ul>
            <li><strong>Legal basis:</strong> We process your email address under the lawful basis
              of contractual necessity (to provide the service you signed up for). We process
              submission data under the lawful basis of our legitimate interest in providing
              the grading service, subject to your overriding rights.</li>
            <li><strong>Data transfers:</strong> Your account data may be processed in the United
              States. Such transfers occur under Standard Contractual Clauses (SCCs).</li>
            <li><strong>Your rights:</strong> You have the right to access, correct, delete, or
              port your personal data; to object to processing; and to withdraw consent.
              Contact us at <a href="mailto:hello@gradewithkatana.com">hello@gradewithkatana.com</a>.</li>
            <li><strong>Retention:</strong> Account data is retained for the duration of your
              account. Submission data is not retained. Upon account deletion, account data is
              deleted within 30 days.</li>
            <li><strong>DPA:</strong> A Data Processing Agreement is available for EU institutions
              upon request.</li>
          </ul>
        </section>

        <section className={styles.section}>
          <h2>8. Security</h2>
          <ul>
            <li>All data in transit is encrypted using TLS 1.2 or higher.</li>
            <li>Account data at rest is encrypted with AES-256.</li>
            <li>Access to account data is restricted to authorized personnel on a need-to-know basis.</li>
            <li>Submission data is never written to disk or database at any stage of processing.</li>
          </ul>
          <p>
            If you discover a security vulnerability, please report it to <a href="mailto:hello@gradewithkatana.com">hello@gradewithkatana.com</a>.
          </p>
        </section>

        <section className={styles.section}>
          <h2>9. Cookies</h2>
          <p>
            Our website uses only essential cookies required for authentication (session token).
            We do not use tracking cookies, advertising cookies, or third-party analytics cookies.
          </p>
        </section>

        <section className={styles.section}>
          <h2>10. Children&apos;s Privacy</h2>
          <p>
            Katana is a tool for educators, not students. We do not knowingly collect personal
            information from individuals under 18. If you believe a child has provided us
            personal information, contact us and we will delete it promptly. Instructors who
            use Katana to grade K–12 student work are responsible for ensuring their use
            complies with applicable laws including COPPA (if applicable).
          </p>
        </section>

        <section className={styles.section}>
          <h2>11. Changes to This Policy</h2>
          <p>
            We will post any changes to this policy on this page and update the effective date.
            Material changes will be communicated by email. Continued use of Katana after
            changes take effect constitutes acceptance of the updated policy.
          </p>
        </section>

        <section className={styles.section}>
          <h2>12. Contact</h2>
          <p>
            Privacy questions, data subject requests, and DPA inquiries:
            <br /><a href="mailto:hello@gradewithkatana.com">hello@gradewithkatana.com</a>
            <br />Torabashiri, LLC · gradewithkatana.com
          </p>
        </section>
      </main>

      <footer className={styles.footer}>
        <Link href="/">← Back to Katana</Link>
        <span>·</span>
        <Link href="/terms">Terms of Use</Link>
        <span>·</span>
        <Link href="/faq">FAQ</Link>
      </footer>
    </div>
  );
}
