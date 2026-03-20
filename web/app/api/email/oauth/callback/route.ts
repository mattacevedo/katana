// app/api/email/oauth/callback/route.ts
//
// Handles the Google OAuth callback after the inbox owner approves access.
// Exchanges the auth code for tokens and displays the refresh token so it
// can be saved to Vercel as GOOGLE_REFRESH_TOKEN.
//
// ADMIN-ONLY: requires the logged-in user's email to match ADMIN_EMAIL.
// This route is only ever visited once (manually by the inbox owner).

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '../../../../../lib/supabase/server';

const REDIRECT_URI = 'https://www.gradewithkatana.com/api/email/oauth/callback';

async function verifyAdmin() {
  const serverSupabase = await createServerClient();
  const { data: { user } } = await serverSupabase.auth.getUser();
  if (!user) return null;
  const adminEmail = process.env.ADMIN_EMAIL || '';
  if (!adminEmail || user.email?.toLowerCase() !== adminEmail.toLowerCase()) return null;
  return user;
}

export async function GET(req: NextRequest) {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const code  = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error) {
    return NextResponse.json({ error: `Google OAuth error: ${error}` }, { status: 400 });
  }

  if (!code) {
    return NextResponse.json({ error: 'No authorization code received.' }, { status: 400 });
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri:  REDIRECT_URI,
      grant_type:    'authorization_code',
    }),
  });

  const tokens = await res.json();

  if (!tokens.refresh_token) {
    return NextResponse.json({
      error:   'No refresh token returned. Revoke app access in your Google Account settings and try again.',
    }, { status: 400 });
  }

  // Display the refresh token — copy it to Vercel as GOOGLE_REFRESH_TOKEN
  return NextResponse.json({
    success: true,
    message: 'Copy the refresh_token below and add it to Vercel as GOOGLE_REFRESH_TOKEN, then redeploy.',
    refresh_token: tokens.refresh_token,
  });
}
