// app/auth/callback/route.ts
// Handles Supabase Auth magic-link redirect.
//
// With implicit flow, Supabase redirects to:
//   /auth/callback#access_token=xxx&refresh_token=yyy&type=signup
//
// The hash fragment is NEVER sent to the server — we return an HTML page
// that reads window.location.hash client-side, then passes the token to
// the Chrome extension via chrome.runtime.sendMessage.

import { NextRequest, NextResponse } from 'next/server';

const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || '';
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function GET(_req: NextRequest) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Katana — Signing In</title>
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
    .status { margin-top: 16px; font-size: 13px; font-weight: 600; color: #059669; }
    .status.error { color: #dc2626; }
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
  <h1 id="heading">Signing in…</h1>
  <p class="sub" id="sub">Activating Katana in your browser…</p>
  <p class="status" id="status"></p>
</div>

<script>
(async () => {
  const spinner  = document.getElementById('spinner');
  const heading  = document.getElementById('heading');
  const sub      = document.getElementById('sub');
  const status   = document.getElementById('status');
  const card     = document.getElementById('card');
  const extId    = '${EXTENSION_ID}';
  const sbUrl    = '${SUPABASE_URL}';
  const sbKey    = '${SUPABASE_ANON_KEY}';

  // Safely escape any string before inserting into innerHTML
  function escHtml(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }

  function showError(msg) {
    spinner.style.display = 'none';
    heading.textContent   = 'Sign-in failed';
    sub.textContent       = msg;
    status.className      = 'status error';
    // Hardcoded anchor — no user input involved
    status.innerHTML      = '<a class="try-again" href="/auth/signin">← Try again</a>';
  }

  function showSuccess(textLine1, textLine2) {
    spinner.style.display = 'none';
    // Build DOM safely — no user-controlled data goes through innerHTML
    card.innerHTML = '<div class="icon">✅</div><h1>You\'re signed in!</h1>';
    const p = document.createElement('p');
    p.className = 'sub';
    // textLine1/2 may contain safe HTML we authored (e.g. <strong>, <br>)
    // but user-supplied values (email) must be escaped first
    p.innerHTML = textLine1 + (textLine2 ? '<br>' + textLine2 : '');
    card.appendChild(p);
  }

  // ── Parse hash fragment ──────────────────────────────────────────────────
  const hash   = window.location.hash.slice(1);   // drop leading '#'
  const params = new URLSearchParams(hash);
  const accessToken  = params.get('access_token');
  const refreshToken = params.get('refresh_token');

  if (!accessToken) {
    // PKCE link (old flow) or stale link — guide the user to request a new one
    const code = new URLSearchParams(window.location.search).get('code');
    if (code) {
      showError('This link uses an older format. Please request a fresh sign-in link.');
    } else {
      showError('No sign-in token found. The link may have expired — please request a new one.');
    }
    return;
  }

  // ── Fetch user profile ───────────────────────────────────────────────────
  let user, plan = 'free';
  try {
    const userRes = await fetch(sbUrl + '/auth/v1/user', {
      headers: { 'Authorization': 'Bearer ' + accessToken, 'apikey': sbKey }
    });
    if (!userRes.ok) throw new Error('user fetch failed');
    user = await userRes.json();
  } catch (e) {
    showError('Could not retrieve your account. Please try again.');
    return;
  }

  // ── Fetch plan from profiles table ───────────────────────────────────────
  try {
    const planRes = await fetch(
      sbUrl + '/rest/v1/profiles?select=plan&id=eq.' + encodeURIComponent(user.id) + '&limit=1',
      { headers: { 'Authorization': 'Bearer ' + accessToken, 'apikey': sbKey, 'Accept': 'application/json' } }
    );
    const profiles = await planRes.json();
    if (Array.isArray(profiles) && profiles[0]) plan = profiles[0].plan || 'free';
  } catch (e) { /* default to free */ }

  // ── Send token to Chrome extension ───────────────────────────────────────
  if (!extId) {
    showSuccess('Signed in as <strong>' + escHtml(user.email || '') + '</strong>.', 'You can close this tab.');
    return;
  }

  try {
    await chrome.runtime.sendMessage(extId, {
      type: 'AUTH_TOKEN_RECEIVED',
      token: accessToken,
      email: user.email,
      plan,
    });
    showSuccess('Katana is ready.', 'You can close this tab.');
    setTimeout(() => window.close(), 2500);
  } catch (e) {
    // Extension not installed or not enabled — still a successful sign-in
    showSuccess(
      'Signed in as <strong>' + escHtml(user.email || '') + '</strong>.',
      'Make sure the Katana extension is installed and enabled, then try grading again.'
    );
  }
})();
</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
