// app/auth/callback/route.ts
//
// Supabase magic-link PKCE callback.
//
// @supabase/ssr 0.5+ always generates PKCE magic links (ignores flowType:'implicit').
// Supabase redirects here with ?code=xxx (PKCE auth code). We exchange it
// server-side for a session, write the auth cookies onto the redirect response,
// then send the user where they need to go:
//
//   • kt_from=extension cookie  →  /auth/extension-callback (sends token to Chrome extension)
//   • ?next=/admin              →  redirect to that path (web destination)
//   • no next, no cookie        →  /dashboard
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
    // No code — stale or malformed link
    return NextResponse.redirect(`${origin}/auth/signin?error=invalid_code`);
  }

  const cookieStore = await cookies();

  // Check for the extension sign-in cookie (set by the signin page when
  // ?source=extension is in the URL, i.e. opened from Chrome extension).
  const fromExtension = cookieStore.get('kt_from')?.value === 'extension';

  // Determine where to send the user after a successful exchange.
  let redirectTarget: string;
  if (fromExtension) {
    redirectTarget = `${origin}/auth/extension-callback`;
  } else if (next) {
    // Use URL constructor to resolve `next` against our own origin — this safely
    // handles encoded tricks like %2F%2Fevil.com that bypass simple string checks.
    // We only follow the redirect if it resolves to the same origin.
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

  // Clear the extension cookie now that we've read it
  if (fromExtension) {
    response.cookies.set('kt_from', '', { maxAge: 0, path: '/' });
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            // Write onto both the response (sent to browser) and the store
            // (so any middleware that runs after also sees the cookies).
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
            try { cookieStore.set(name, value, options); } catch { /* server component */ }
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    console.error('[auth/callback] exchangeCodeForSession error:', error.message);
    return NextResponse.redirect(`${origin}/auth/signin?error=invalid_code`);
  }

  return response;
}
