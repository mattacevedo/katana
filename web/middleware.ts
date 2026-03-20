// middleware.ts — Centralized auth + session refresh
//
// Runs on every matched request. Two responsibilities:
//   1. Refresh Supabase session cookies (keeps sessions alive across tabs/requests)
//   2. Redirect unauthenticated users away from protected pages (/dashboard, /admin)
//
// API routes are NOT redirected here — they handle their own auth
// (Bearer tokens, webhook secrets, etc.) and return 401 directly.

import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// Page routes that require a logged-in user
const PROTECTED_PAGES = ['/dashboard', '/admin'];

export async function middleware(request: NextRequest) {
  // Start with a plain next() response so we can attach cookie mutations
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // Write cookies to the request (for downstream server components)
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          // Recreate response with updated request cookies
          response = NextResponse.next({ request });
          // Write cookies to the response (for the browser)
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh the session — this is the primary purpose of the middleware.
  // getUser() contacts the Supabase auth server and refreshes expired tokens.
  const { data: { user } } = await supabase.auth.getUser();

  // Redirect unauthenticated users from protected pages to sign-in
  const { pathname } = request.nextUrl;
  if (!user && PROTECTED_PAGES.some(p => pathname.startsWith(p))) {
    const signinUrl = request.nextUrl.clone();
    signinUrl.pathname = '/auth/signin';
    signinUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(signinUrl);
  }

  return response;
}

// Only run middleware on page routes + auth routes (for session refresh).
// Exclude static assets, API routes (self-authenticated), and Next.js internals.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon\\.ico|icons/|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$).*)',
  ],
};
