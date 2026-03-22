'use client';

import { useState } from 'react';
import styles from './admin.module.css';

export default function AddGrades() {
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('50');
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);

    const parsed = parseInt(amount, 10);
    if (!email.trim() || isNaN(parsed) || parsed <= 0) {
      setStatus({ ok: false, msg: 'Enter a valid email and a positive number of grades.' });
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/admin/add-grades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), amount: parsed }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatus({ ok: true, msg: `+${parsed} grades added to ${data.email}.` });
        setEmail('');
        setAmount('50');
      } else {
        setStatus({ ok: false, msg: data.error || 'Something went wrong.' });
      }
    } catch {
      setStatus({ ok: false, msg: 'Network error.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className={styles.addGradesForm}>
      <div className={styles.addGradesRow}>
        <input
          type="email"
          placeholder="user@example.com"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className={styles.addGradesInput}
          required
        />
        <input
          type="number"
          min="1"
          max="10000"
          placeholder="Amount"
          value={amount}
          onChange={e => setAmount(e.target.value)}
          className={styles.addGradesInputNarrow}
          required
        />
        <button type="submit" disabled={loading} className={styles.addGradesBtn}>
          {loading ? 'Adding…' : 'Add Grades'}
        </button>
      </div>
      {status && (
        <p className={status.ok ? styles.addGradesSuccess : styles.addGradesError}>
          {status.msg}
        </p>
      )}
    </form>
  );
}
