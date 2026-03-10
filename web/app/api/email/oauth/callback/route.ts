// app/api/email/oauth/callback/route.ts
//
// Handles the Google OAuth callback after the inbox owner approves access.
// Exchanges the auth code for tokens and displays the refresh token so it
// can be saved to Vercel as GOOGLE_REFRESH_TOKEN.
//
// This route is only ever visited once (manually by the inbox owner).

import { NextRequest, NextResponse } from 'next/server';

const REDIRECT_URI = 'https://www.gradewithkatana.com/api/email/oauth/callback';

export async function GET(req: NextRequest) {
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
      details: tokens,
    }, { status: 400 });
  }

  // Display the refresh token — copy it to Vercel as GOOGLE_REFRESH_TOKEN
  return NextResponse.json({
    success: true,
    message: 'Copy the refresh_token below and add it to Vercel as GOOGLE_REFRESH_TOKEN, then redeploy.',
    refresh_token: tokens.refresh_token,
  });
}
