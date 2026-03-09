// app/auth/signin/page.tsx
// Unified sign-in / sign-up page.
// Supabase magic links work for both: new emails create an account automatically.
// The same link is sent regardless — no password ever needed.

'use client';

import { useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '../../../lib/supabase/client';
import Link from 'next/link';
import styles from '../auth.module.css';

const URL_ERROR_MESSAGES: Record<string, string> = {
  missing_code: 'The sign-in link was invalid or has already been used. Please request a new one.',
  invalid_code: 'The sign-in link could not be verified. It may have expired. Please request a new one.',
};

function SignInContent() {
  const searchParams = useSearchParams();
  const urlError = searchParams.get('error');
  const plan = searchParams.get('plan') || '';
  const urlErrorMessage = urlError
    ? (URL_ERROR_MESSAGES[urlError] || 'Something went wrong. Please try again.')
    : '';

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
    } else {
      setSent(true);
    }
  }

  if (sent) {
    return (
      <div className={styles.container}>
        <div className={styles.card}>
          <div className={styles.icon}>📬</div>
          <h1 className={styles.title}>Check your inbox</h1>
          <p className={styles.subtitle}>
            We sent a magic link to <strong>{email}</strong>.<br />
            Click it to sign in — the Katana extension activates automatically.
          </p>
          <p className={styles.hint}>
            Can&apos;t find it? Check your spam folder, or&nbsp;
            <button className={styles.linkBtn} onClick={() => setSent(false)}>
              try a different email
            </button>
            .
          </p>
        </div>
      </div>
    );
  }

  const planLabel: Record<string, string> = {
    basic: 'Basic',
    super: 'Super',
    shogun: 'Shogun',
  };

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>⚔️ Katana</div>
        <h1 className={styles.title}>
          {plan ? `Get started — ${planLabel[plan] ?? plan} plan` : 'Sign in or create an account'}
        </h1>
        <p className={styles.subtitle}>
          Enter your email and we&apos;ll send a magic link.
          No password — ever. New to Katana? Your free account is created automatically.
        </p>

        {urlErrorMessage && <p className={styles.error}>{urlErrorMessage}</p>}

        <form onSubmit={handleSubmit} className={styles.form}>
          <input
            type="email"
            className={styles.input}
            placeholder="your@email.com"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
          />
          {error && <p className={styles.error}>{error}</p>}
          <button type="submit" className={styles.btnPrimary} disabled={loading}>
            {loading ? 'Sending…' : 'Send Magic Link'}
          </button>
        </form>

        <p className={styles.footer}>
          50 free grades / month · No credit card required
        </p>
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={null}>
      <SignInContent />
    </Suspense>
  );
}
