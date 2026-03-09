// app/auth/callback/route.ts
// Handles Supabase Auth magic-link redirect.
// After confirming the session, returns an HTML page that:
//  1. Shows a success message to the user.
//  2. Uses chrome.runtime.sendMessage to pass the session token to the extension.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || ''; // set in env

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');

  if (!code) {
    return NextResponse.redirect(new URL('/auth/signin?error=missing_code', req.url));
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.session) {
    return NextResponse.redirect(new URL('/auth/signin?error=invalid_code', req.url));
  }

  const { access_token, user } = data.session;

  // Fetch the user's plan from our DB (set by Stripe webhook)
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan')
    .eq('id', user.id)
    .single();

  const plan = profile?.plan || 'free';

  // Return HTML that sends the token to the extension then closes itself
  const html = `<!DOCTYPE html>
<html>
<head><title>Katana — Signed In</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #f4f5f7; margin: 0; }
  .card { background: #fff; border-radius: 12px; padding: 40px; text-align: center; max-width: 360px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
  .icon { font-size: 40px; margin-bottom: 16px; }
  h1 { font-size: 20px; font-weight: 700; color: #1a1a2e; margin-bottom: 8px; }
  p { font-size: 14px; color: #6b7280; }
  .status { margin-top: 16px; font-size: 13px; color: #059669; font-weight: 600; }
</style>
</head>
<body>
<div class="card">
  <div class="icon">✅</div>
  <h1>You&apos;re signed in!</h1>
  <p>Activating Katana in your browser…</p>
  <p class="status" id="status"></p>
</div>
<script>
(async () => {
  const status = document.getElementById('status');
  const extensionId = '${EXTENSION_ID}';
  if (!extensionId) { status.textContent = 'Extension ID not configured.'; return; }
  try {
    await chrome.runtime.sendMessage(extensionId, {
      type: 'AUTH_TOKEN_RECEIVED',
      token: '${access_token}',
      email: '${user.email}',
      plan: '${plan}'
    });
    status.textContent = 'Katana is ready! You can close this tab.';
    setTimeout(() => window.close(), 2000);
  } catch (e) {
    status.textContent = 'Could not reach extension — make sure it is installed and enabled.';
  }
})();
</script>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html' }
  });
}
