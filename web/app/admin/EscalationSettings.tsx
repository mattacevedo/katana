'use client';
// app/admin/EscalationSettings.tsx
//
// Lets the admin configure which email addresses receive a notification
// whenever an inbound email is flagged as "needs_attention".

import { useState } from 'react';
import styles from './admin.module.css';

interface Props {
  initialEmails: string;
}

export default function EscalationSettings({ initialEmails }: Props) {
  const [value,  setValue]  = useState(initialEmails);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [errMsg, setErrMsg] = useState('');

  async function handleSave() {
    setStatus('saving');
    setErrMsg('');
    try {
      const res = await fetch('/api/admin/settings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ key: 'escalation_emails', value: value.trim() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2500);
    } catch (err) {
      setStatus('error');
      setErrMsg(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <div className={styles.settingsBox}>
      <div className={styles.settingsRow}>
        <div className={styles.settingsLeft}>
          <div className={styles.settingsLabel}>Escalation notification emails</div>
          <div className={styles.settingsHint}>
            When an inbound email is flagged for human review, Katana sends a notification
            to these addresses. Separate multiple addresses with commas or semicolons.
          </div>
        </div>
        <div className={styles.settingsRight}>
          <textarea
            className={styles.settingsTextarea}
            value={value}
            onChange={e => setValue(e.target.value)}
            rows={2}
            placeholder="you@example.com, colleague@example.com"
            spellCheck={false}
          />
          <div className={styles.settingsActions}>
            <button
              className={styles.settingsSaveBtn}
              onClick={handleSave}
              disabled={status === 'saving'}
            >
              {status === 'saving' ? 'Saving…' : 'Save'}
            </button>
            {status === 'saved' && (
              <span className={styles.settingsSavedMsg}>✓ Saved</span>
            )}
            {status === 'error' && (
              <span className={styles.settingsErrMsg}>{errMsg}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
