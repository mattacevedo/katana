// app/auth/extension-callback/page.tsx
//
// After a successful PKCE sign-in where the destination is the Chrome extension,
// the server callback redirects here with the access token in the URL hash:
//   /auth/extension-callback#access_token=…&email=…
//
// The page reads the token from the hash (primary) or falls back to
// getSession() (secondary), fetches the user's plan, then sends the
// token to the Chrome extension via chrome.runtime.sendMessage.

'use client';

import { useEffect, useState } from 'react';
import { createClient } from '../../../lib/supabase/client';

const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || '';

export default function ExtensionCallbackPage() {
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    async function run() {
      console.log('[extension-callback] Starting. EXTENSION_ID:', EXTENSION_ID || '(empty)');

      // ── 1. Read access token ──────────────────────────────────────────────
      // Primary: read from URL hash fragment (passed by the server callback).
      // This is the most reliable path — no dependency on cookie propagation.
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      let token = hashParams.get('access_token') || '';
      let email = hashParams.get('email') || '';
      let userId = '';

      // Clean the hash from the URL so the token doesn't linger in browser history
      if (token) {
        console.log('[extension-callback] Got token from URL hash, email:', email);
        window.history.replaceState(null, '', window.location.pathname);
      }

      // Fallback: read from cookies via getSession() if hash was empty
      const supabase = createClient();
      if (!token) {
        console.log('[extension-callback] No token in hash, falling back to getSession()');
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) {
          console.error('[extension-callback] getSession error:', sessionError.message);
        }
        if (session) {
          token = session.access_token;
          email = session.user?.email || email;
          userId = session.user?.id || '';
          console.log('[extension-callback] Got token from getSession, email:', email);
        }
      }

      if (!token) {
        console.error('[extension-callback] No token from hash or getSession — auth failed');
        setErrorMsg('Could not read your session. Please try signing in again.');
        setStatus('error');
        return;
      }

      // ── 2. Fetch plan ─────────────────────────────────────────────────────
      let plan = 'free';
      try {
        // If we don't have userId from getSession, get it from the token's session
        if (!userId) {
          const { data: { session } } = await supabase.auth.getSession();
          userId = session?.user?.id || '';
        }
        if (userId) {
          const { data } = await supabase
            .from('profiles')
            .select('plan')
            .eq('id', userId)
            .single();
          if (data?.plan) plan = data.plan;
        }
      } catch { /* default to free */ }

      console.log('[extension-callback] Plan:', plan);

      // ── 3. Send token to Chrome extension ─────────────────────────────────
      if (!EXTENSION_ID) {
        console.error('[extension-callback] EXTENSION_ID is empty — cannot notify extension. Check NEXT_PUBLIC_EXTENSION_ID env var.');
        // Still show success since the user IS signed in (web-side)
        setStatus('success');
        setTimeout(() => window.close(), 2500);
        return;
      }

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cr = (window as any).chrome?.runtime;
        if (!cr?.sendMessage) {
          console.warn('[extension-callback] chrome.runtime.sendMessage not available (not Chrome?)');
        } else {
          console.log('[extension-callback] Sending AUTH_TOKEN_RECEIVED to extension:', EXTENSION_ID);
          const resp = await cr.sendMessage(EXTENSION_ID, {
            type: 'AUTH_TOKEN_RECEIVED',
            token,
            email,
            plan,
          });
          console.log('[extension-callback] Extension responded:', JSON.stringify(resp));
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[extension-callback] sendMessage failed:', msg);
        // Common causes:
        //   - Extension not installed or disabled
        //   - Extension ID mismatch
        //   - Page URL not in externally_connectable.matches
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
