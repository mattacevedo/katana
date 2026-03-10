// app/auth/extension-callback/page.tsx
//
// After a successful PKCE sign-in where the destination is the Chrome extension,
// the server callback redirects here. This client page reads the session that
// was just written into the browser cookies, sends the access token to the
// extension via chrome.runtime.sendMessage, then shows a confirmation.

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabase/client';

const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || '';

export default function ExtensionCallbackPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function run() {
      const supabase = createClient();

      // Session was established server-side — getSession reads from cookies
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError || !session) {
        setErrorMsg('Could not read your session. Please try signing in again.');
        setStatus('error');
        return;
      }

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
            await cr.sendMessage(EXTENSION_ID, {
              type: 'AUTH_TOKEN_RECEIVED',
              token: session.access_token,
              email: session.user.email,
              plan,
            });
          }
        } catch { /* extension not installed or not active — that's OK */ }
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
