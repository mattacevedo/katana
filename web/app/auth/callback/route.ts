// app/auth/callback/route.ts
//
// Supabase magic-link PKCE callback.
//
// @supabase/ssr 0.5+ always generates PKCE magic links (ignores flowType:'implicit').
// Supabase redirects here with ?code=xxx (PKCE auth code). We exchange it
// server-side for a session, write the auth cookies onto the redirect response,
// then send the user where they need to go:
//
//   • ?next=/admin  →  redirect to that path (web destination)
//   • no next, extension configured  →  /auth/extension-callback (sends token to extension)
//   • no next, no extension  →  /dashboard
//
// IMPORTANT: In the Supabase dashboard → Authentication → URL Configuration,
// add  https://www.gradewithkatana.com/auth/callback*  to the Redirect URLs list
// so Supabase honours the ?next= query param on the magic-link redirect.

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextRequest, NextResponse } from 'next/server';

const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || '';

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') || '';

  if (!code) {
    // No code — stale or malformed link
    return NextResponse.redirect(`${origin}/auth/signin?error=invalid_code`);
  }

  // Determine where to send the user after a successful exchange
  const redirectTarget = next && next.startsWith('/')
    ? `${origin}${next}`
    : EXTENSION_ID
      ? `${origin}/auth/extension-callback`
      : `${origin}/dashboard`;

  const response = NextResponse.redirect(redirectTarget);

  const cookieStore = await cookies();
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
