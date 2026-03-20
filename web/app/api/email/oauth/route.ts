// app/api/email/oauth/route.ts
//
// One-time OAuth flow to authorize Katana to create Gmail drafts for
// hello@gradewithkatana.com.
//
// ADMIN-ONLY: requires the logged-in user's email to match ADMIN_EMAIL.
//
// Usage:
//   1. Sign in to gradewithkatana.com as the admin
//   2. Visit https://www.gradewithkatana.com/api/email/oauth
//   3. Approve the Gmail consent screen
//   4. You land on /api/email/oauth/callback which shows your refresh token
//   5. Copy it to Vercel as GOOGLE_REFRESH_TOKEN and redeploy

import { NextResponse } from 'next/server';
import { createClient as createServerClient } from '../../../../lib/supabase/server';

const REDIRECT_URI = 'https://www.gradewithkatana.com/api/email/oauth/callback';

// gmail.modify = read messages/threads/labels + create drafts + send emails
// (superset of gmail.compose; needed for thread search, label management, and history)
const SCOPES = ['https://www.googleapis.com/auth/gmail.modify'];

async function verifyAdmin() {
  const serverSupabase = await createServerClient();
  const { data: { user } } = await serverSupabase.auth.getUser();
  if (!user) return null;
  const adminEmail = process.env.ADMIN_EMAIL || '';
  if (!adminEmail || user.email?.toLowerCase() !== adminEmail.toLowerCase()) return null;
  return user;
}

export async function GET() {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

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
