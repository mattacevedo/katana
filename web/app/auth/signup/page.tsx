// app/auth/signup/page.tsx
// For magic links, signup and signin are identical —
// Supabase auto-creates an account on first use.
// This page just has slightly different copy to feel welcoming.

'use client';

import { useState } from 'react';
import { createClient } from '../../../lib/supabase/client';
import Link from 'next/link';
import styles from '../auth.module.css';

export default function SignUpPage() {
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
        emailRedirectTo: `${window.location.origin}/auth/callback?source=extension`,
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
            We sent a magic link to <strong>{email}</strong>.
            Click it to activate your free Katana account — no password ever needed.
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
        <h1 className={styles.title}>Create your free account</h1>
        <p className={styles.subtitle}>
          50 free grades per month. No credit card. No password — ever.
        </p>

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
            {loading ? 'Sending…' : 'Get Started Free'}
          </button>
        </form>

        <p className={styles.footer}>
          Already have an account? <Link href="/auth/signin">Sign in</Link>
        </p>
      </div>
    </div>
  );
}
