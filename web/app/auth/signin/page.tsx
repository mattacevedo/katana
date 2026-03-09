// app/auth/signin/page.tsx
// Magic-link sign-in via Supabase Auth.
// After sign-in, redirects to /auth/callback which sends the token to the extension.

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
  const urlErrorMessage = urlError ? (URL_ERROR_MESSAGES[urlError] || 'Something went wrong. Please try again.') : '';

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
          <h1 className={styles.title}>Check your email</h1>
          <p className={styles.subtitle}>
            We sent a sign-in link to <strong>{email}</strong>.
            Click it to complete sign-in — the Katana extension will activate automatically.
          </p>
          <button className={styles.btnSecondary} onClick={() => setSent(false)}>
            Use a different email
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <div className={styles.logo}>⚔️ Katana</div>
        <h1 className={styles.title}>Sign in</h1>
        <p className={styles.subtitle}>We&apos;ll email you a magic link — no password needed.</p>

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
          No account? <Link href="/auth/signup">Create one free</Link>
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
