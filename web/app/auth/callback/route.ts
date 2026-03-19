// app/auth/callback/route.ts
//
// Supabase magic-link PKCE callback.
//
// @supabase/ssr 0.5+ always generates PKCE magic links (ignores flowType:'implicit').
// Supabase redirects here with ?code=xxx (PKCE auth code). We exchange it
// server-side for a session, write the auth cookies onto the redirect response,
// then send the user where they need to go:
//
//   • kt_from=extension cookie  →  /auth/extension-callback#access_token=…&email=…
//   • ?next=/admin              →  redirect to that path (web destination)
//   • no next, no cookie        →  /dashboard
//
// For extension logins we pass the access token directly via URL hash fragment
// (the same pattern as OAuth 2.0 Implicit flow). This is more robust than
// relying on the client-side getSession() call on the extension-callback page,
// which can silently fail if cookies aren't propagated correctly.
// Hash fragments are never sent to servers / logged by proxies, so this is safe.
//
// The extension sign-in flow sets the kt_from cookie on the signin page so we
// don't need extra query params in emailRedirectTo (which would break Supabase's
// redirect URL allowlist matching).
//
// IMPORTANT: In the Supabase dashboard → Authentication → URL Configuration,
// add  https://www.gradewithkatana.com/auth/callback  to the Redirect URLs list.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '';

  if (!code) {
    console.error('[auth/callback] No code in URL — stale or malformed link');
    return NextResponse.redirect(`${origin}/auth/signin?error=invalid_code`);
  }

  const cookieStore = await cookies();

  // Check for the extension sign-in cookie (set by the signin page when
  // ?source=extension is in the URL, i.e. opened from Chrome extension).
  const fromExtension = cookieStore.get('kt_from')?.value === 'extension';
  console.log('[auth/callback] fromExtension:', fromExtension, '| code length:', code.length);

  // ── Exchange the PKCE code for a session FIRST, before building the redirect,
  //    so we can include the access_token in the hash fragment for extension logins.
  const pendingCookies: Array<{ name: string; value: string; options: Record<string, unknown> }> = [];

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          // Buffer cookies — we'll apply them to the final response after we know the redirect target.
          pendingCookies.push(...cookiesToSet.map(c => ({
            name: c.name,
            value: c.value,
            options: c.options as Record<string, unknown>,
          })));
          cookiesToSet.forEach(({ name, value, options }) => {
            try { cookieStore.set(name, value, options); } catch { /* server component */ }
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('[auth/callback] exchangeCodeForSession error:', error.message);
    return NextResponse.redirect(`${origin}/auth/signin?error=invalid_code`);
  }

  console.log('[auth/callback] Session exchanged OK, user:', data.session?.user?.email);

  // ── Determine where to send the user ──────────────────────────────────────
  let redirectTarget: string;

  if (fromExtension) {
    // Pass the access token + email directly in the hash fragment so the
    // extension-callback page can send it to the Chrome extension immediately
    // without needing to call getSession() (which can fail if cookies
    // aren't propagated correctly across the redirect).
    const token = data.session?.access_token || '';
    const email = data.session?.user?.email || '';
    const hash = `#access_token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
    redirectTarget = `${origin}/auth/extension-callback${hash}`;
    console.log('[auth/callback] Redirecting to extension-callback with token in hash');
  } else if (next) {
    try {
      const resolved = new URL(next, origin);
      redirectTarget = resolved.origin === origin ? resolved.href : `${origin}/dashboard`;
    } catch {
      redirectTarget = `${origin}/dashboard`;
    }
  } else {
    redirectTarget = `${origin}/dashboard`;
  }

  const response = NextResponse.redirect(redirectTarget);

  // Apply buffered session cookies to the redirect response
  pendingCookies.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
  });

  // Clear the extension cookie now that we've read it
  if (fromExtension) {
    response.cookies.set('kt_from', '', { maxAge: 0, path: '/' });
  }

  return response;
}
