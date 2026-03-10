// app/auth/callback/route.ts
// Handles Supabase Auth magic-link redirect.
//
// With implicit flow, Supabase redirects to:
//   /auth/callback#access_token=xxx&refresh_token=yyy&type=signup
//
// The hash fragment is NEVER sent to the server — we return an HTML page
// whose client-side JS does the following:
//
//   1. Parse access_token + refresh_token from window.location.hash
//   2. POST to /api/auth/set-session → sets browser cookies (enables web auth)
//   3. Optionally send token to Chrome extension via chrome.runtime.sendMessage
//   4. Redirect to ?next= param (e.g. /admin) or /dashboard

import { NextRequest, NextResponse } from 'next/server';

const EXTENSION_ID  = process.env.NEXT_PUBLIC_EXTENSION_ID || '';
const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function GET(_req: NextRequest) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Katana \u2014 Signing In</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; background: #f4f5f7;
    }
    .card {
      background: #fff; border-radius: 14px; padding: 40px 36px;
      text-align: center; max-width: 380px; width: 90%;
      box-shadow: 0 4px 24px rgba(0,0,0,0.09);
    }
    .icon { font-size: 44px; margin-bottom: 18px; line-height: 1; }
    h1 { font-size: 20px; font-weight: 700; color: #1a1a2e; margin-bottom: 10px; }
    .sub { font-size: 14px; color: #6b7280; line-height: 1.6; }
    .status { margin-top: 16px; font-size: 13px; font-weight: 600; color: #dc2626; }
    .try-again {
      display: inline-block; margin-top: 20px; font-size: 14px;
      color: #2563eb; text-decoration: none; font-weight: 600;
    }
    .try-again:hover { text-decoration: underline; }
    .spinner {
      width: 32px; height: 32px; margin: 0 auto 18px;
      border: 3px solid #e5e7eb; border-top-color: #2563eb;
      border-radius: 50%; animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
<div class="card" id="card">
  <div class="spinner" id="spinner"></div>
  <h1 id="heading">Signing in\u2026</h1>
  <p class="sub" id="sub">Verifying your sign-in link\u2026</p>
  <p class="status" id="status"></p>
</div>

<script>
(async () => {
  const spinner = document.getElementById('spinner');
  const heading = document.getElementById('heading');
  const sub     = document.getElementById('sub');
  const status  = document.getElementById('status');
  const card    = document.getElementById('card');
  const extId   = '${EXTENSION_ID}';
  const sbUrl   = '${SUPABASE_URL}';
  const sbKey   = '${SUPABASE_ANON}';

  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function showError(msg) {
    spinner.style.display = 'none';
    heading.textContent = 'Sign-in failed';
    sub.textContent     = msg;
    status.innerHTML    = '<a class="try-again" href="/auth/signin">\u2190 Try again</a>';
  }

  function showSuccess(line1, line2) {
    spinner.style.display = 'none';
    card.innerHTML = '<div class="icon">\u2705</div><h1>You\u2019re signed in!</h1>';
    const p = document.createElement('p');
    p.className = 'sub';
    p.innerHTML = line1 + (line2 ? '<br>' + line2 : '');
    card.appendChild(p);
  }

  // ── 1. Parse hash ─────────────────────────────────────────────────────────
  const hash         = window.location.hash.slice(1);
  const params       = new URLSearchParams(hash);
  const accessToken  = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  // ?next= is set by the sign-in page for web destinations like /admin
  const nextUrl = new URLSearchParams(window.location.search).get('next') || '';

  if (!accessToken || !refreshToken) {
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
      showError('This link uses an older format. Please request a fresh sign-in link.');
    } else {
      showError('No sign-in token found. The link may have expired \u2014 please request a new one.');
    }
    return;
  }

  // ── 2. Establish browser session (sets cookies so web pages see a logged-in user)
  try {
    const res = await fetch('/api/auth/set-session', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: accessToken, refresh_token: refreshToken }),
    });
    if (!res.ok) throw new Error('Session error');
  } catch {
    showError('Could not establish your session. Please try signing in again.');
    return;
  }

  // ── 3. Fetch user info (needed for extension message and display) ─────────
  let user, plan = 'free';
  try {
    const userRes = await fetch(sbUrl + '/auth/v1/user', {
      headers: { 'Authorization': 'Bearer ' + accessToken, 'apikey': sbKey }
    });
    if (!userRes.ok) throw new Error('user fetch failed');
    user = await userRes.json();
  } catch {
    showError('Could not retrieve your account. Please try again.');
    return;
  }

  try {
    const planRes = await fetch(
      sbUrl + '/rest/v1/profiles?select=plan&id=eq.' + encodeURIComponent(user.id) + '&limit=1',
      { headers: { 'Authorization': 'Bearer ' + accessToken, 'apikey': sbKey, 'Accept': 'application/json' } }
    );
    const profiles = await planRes.json();
    if (Array.isArray(profiles) && profiles[0]) plan = profiles[0].plan || 'free';
  } catch { /* default to free */ }

  // ── 4. Send token to extension (best-effort, non-blocking) ───────────────
  if (extId) {
    try {
      await chrome.runtime.sendMessage(extId, {
        type: 'AUTH_TOKEN_RECEIVED',
        token: accessToken,
        email: user.email,
        plan,
      });
    } catch { /* extension not installed or not active in this browser — that's OK */ }
  }

  // ── 5. Redirect or show confirmation ─────────────────────────────────────
  if (nextUrl && nextUrl.startsWith('/')) {
    // Web destination (e.g. /admin, /dashboard) — navigate immediately
    window.location.href = nextUrl;
  } else if (!extId) {
    // No extension configured — fall back to dashboard
    window.location.href = '/dashboard';
  } else {
    // Pure extension flow — show brief confirmation and close the tab
    showSuccess('Katana is ready.', 'You can close this tab.');
    setTimeout(() => window.close(), 2500);
  }
})();
</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
