// app/api/auth/set-session/route.ts
// Called by the auth/callback HTML page after it reads the implicit-flow tokens
// from window.location.hash. Exchanges the tokens for a proper Supabase browser
// session by setting the auth cookies on the response.
//
// This is what makes web-based auth (admin dashboard, etc.) work — without this
// the callback page only sends the token to the Chrome extension, never setting
// a cookie, so server-side auth checks always see an unauthenticated user.

import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@supabase/ssr';

export async function POST(req: NextRequest) {
  let access_token: string, refresh_token: string;
  try {
    ({ access_token, refresh_token } = await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  if (!access_token || !refresh_token) {
    return NextResponse.json({ error: 'Missing access_token or refresh_token.' }, { status: 400 });
  }

  // We build the response first, then hand its cookie jar to the Supabase client.
  // When setSession() runs it calls setAll(), which writes the auth cookies
  // directly onto the response headers — the browser applies them on receipt.
  const response = NextResponse.json({ ok: true });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return []; },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2]);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.setSession({ access_token, refresh_token });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }

  return response;
}
