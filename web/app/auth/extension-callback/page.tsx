// app/auth/extension-callback/page.tsx
//
// After a successful PKCE sign-in, the server callback redirects ALL logins
// here (when EXTENSION_ID is set). This page uses localStorage to distinguish:
//
//   • Extension login (localStorage has kt_from=extension):
//     Read the session from cookies → send token to Chrome extension → close tab.
//
//   • Web login (no kt_from in localStorage):
//     Redirect to /dashboard immediately.
//
// The signin page sets localStorage('kt_from', 'extension') when opened
// with ?source=extension (i.e. from the Chrome extension sidepanel).
// localStorage is same-origin only and persists reliably — unlike cookies,
// it's not affected by SameSite rules or cross-site redirect chains.

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabase/client';

const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || '';

export default function ExtensionCallbackPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    // ── Check localStorage synchronously to decide extension vs web login ──
    const fromExtension = localStorage.getItem('kt_from') === 'extension';
    localStorage.removeItem('kt_from');

    if (!fromExtension) {
      // Web login — redirect to dashboard. The session cookies are already
      // set on this response, so the dashboard will see the logged-in user.
      console.log('[extension-callback] Web login detected (no kt_from). Redirecting to /dashboard');
      window.location.href = '/dashboard';
      return;
    }

    // ── Extension login — original working flow ────────────────────────────
    console.log('[extension-callback] Extension login detected. EXTENSION_ID:', EXTENSION_ID || '(empty)');

    async function run() {
      const supabase = createClient();

      // Session was established server-side — getSession reads from cookies
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        console.error('[extension-callback] getSession failed:', sessionError?.message || 'no session');
        setErrorMsg('Could not read your session. Please try signing in again.');
        setStatus('error');
        return;
      }

      console.log('[extension-callback] Session found, email:', session.user.email);

      // Fetch plan for the extension
      let plan = 'free';
      try {
        const { data } = await supabase
          .from('profiles')
          .select('plan')
          .eq('id', session.user.id)
          .single();
        if (data?.plan) plan = data.plan;
      } catch { /* default to free */ }

      // Send token to extension (best-effort)
      if (EXTENSION_ID) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const cr = (window as any).chrome?.runtime;
          if (cr?.sendMessage) {
            console.log('[extension-callback] Sending AUTH_TOKEN_RECEIVED to extension:', EXTENSION_ID);
            const resp = await cr.sendMessage(EXTENSION_ID, {
              type: 'AUTH_TOKEN_RECEIVED',
              token: session.access_token,
              email: session.user.email,
              plan,
            });
            console.log('[extension-callback] Extension responded:', JSON.stringify(resp));
          } else {
            console.warn('[extension-callback] chrome.runtime.sendMessage not available');
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error('[extension-callback] sendMessage failed:', msg);
        }
      } else {
        console.error('[extension-callback] EXTENSION_ID is empty — cannot notify extension');
      }

      setStatus('success');
      // Close the tab after a short pause so the user sees the confirmation
      setTimeout(() => window.close(), 2500);
    }

    run();
  }, []);

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', background: '#f4f5f7',
    }}>
      <div style={{
        background: '#fff', borderRadius: 14, padding: '40px 36px',
        textAlign: 'center', maxWidth: 380, width: '90%',
        boxShadow: '0 4px 24px rgba(0,0,0,0.09)',
      }}>
        {status === 'loading' && (
          <>
            <div style={{
              width: 32, height: 32, margin: '0 auto 18px',
              border: '3px solid #e5e7eb', borderTopColor: '#2563eb',
              borderRadius: '50%', animation: 'spin 0.7s linear infinite',
            }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e', marginBottom: 10 }}>
              Signing in…
            </h1>
            <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>
              Activating Katana in your browser…
            </p>
          </>
        )}

        {status === 'success' && (
          <>
            <div style={{ fontSize: 44, marginBottom: 18, lineHeight: 1 }}>✅</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e', marginBottom: 10 }}>
              You&apos;re signed in!
            </h1>
            <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6 }}>
              Katana is ready. You can close this tab.
            </p>
          </>
        )}

        {status === 'error' && (
          <>
            <div style={{ fontSize: 44, marginBottom: 18, lineHeight: 1 }}>❌</div>
            <h1 style={{ fontSize: 20, fontWeight: 700, color: '#1a1a2e', marginBottom: 10 }}>
              Sign-in failed
            </h1>
            <p style={{ fontSize: 14, color: '#6b7280', lineHeight: 1.6, marginBottom: 16 }}>
              {errorMsg}
            </p>
            <a href="/auth/signin" style={{
              display: 'inline-block', fontSize: 14, color: '#2563eb',
              fontWeight: 600, textDecoration: 'none',
            }}>
              ← Try again
            </a>
          </>
        )}
      </div>
    </div>
  );
}
