// app/api/email/oauth/route.ts
//
// One-time OAuth flow to authorize Katana to create Gmail drafts for
// hello@gradewithkatana.com.
//
// Usage:
//   1. Visit https://www.gradewithkatana.com/api/email/oauth (as the inbox owner)
//   2. Approve the Gmail consent screen
//   3. You land on /api/email/oauth/callback which shows your refresh token
//   4. Copy it to Vercel as GOOGLE_REFRESH_TOKEN and redeploy

import { NextResponse } from 'next/server';

const REDIRECT_URI = 'https://www.gradewithkatana.com/api/email/oauth/callback';

// gmail.modify = read messages/threads/labels + create drafts + send emails
// (superset of gmail.compose; needed for thread search, label management, and history)
const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

export async function GET() {
  const params = new URLSearchParams({
    client_id:     process.env.GOOGLE_CLIENT_ID!,
    redirect_uri:  REDIRECT_URI,
    response_type: 'code',
    scope:         SCOPES.join(' '),
    access_type:   'offline',   // required to get a refresh token
    prompt:        'consent',   // force refresh token even if previously authorized
  });

  return NextResponse.redirect(
    `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  );
}
