// app/api/email/send-reply/route.ts
//
// Called by Upstash QStash after a 25–45 minute delay to send a deferred
// auto-reply email. The inbound webhook queues the fully-built MIME message
// here instead of sending it directly, so replies arrive with a human-looking
// delay rather than instantly.
//
// Security: QStash signs every delivery with an HMAC. We verify that signature
// before doing anything — unauthenticated requests are rejected with 401.

import { NextRequest, NextResponse } from 'next/server';
import { Receiver } from '@upstash/qstash';
import { createAdminClient } from '../../../../lib/supabase/admin';

const receiver = new Receiver({
  currentSigningKey: process.env.QSTASH_CURRENT_SIGNING_KEY!,
  nextSigningKey:    process.env.QSTASH_NEXT_SIGNING_KEY!,
});

// ── Gmail helpers (duplicated from inbound route to keep this endpoint self-contained) ──

async function getGmailAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
      grant_type:    'refresh_token',
    }),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Gmail token refresh failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

async function sendGmailMessage(
  accessToken: string, raw: string, threadId?: string | null
): Promise<{ id: string; threadId: string }> {
  const body: Record<string, string> = { raw };
  if (threadId) body.threadId = threadId;
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gmail send error (${res.status}): ${await res.text()}`);
  return res.json();
}

async function storeThread(senderEmail: string, gmailThreadId: string): Promise<void> {
  try {
    const supabase = createAdminClient();
    await supabase
      .from('email_threads')
      .upsert(
        { sender_email: senderEmail.toLowerCase(), gmail_thread_id: gmailThreadId, updated_at: new Date().toISOString() },
        { onConflict: 'sender_email' }
      );
  } catch (err) {
    console.warn('email/send-reply: failed to persist thread mapping (non-fatal)', err);
  }
}

// ── Handler ──────────────────────────────────────────────────────────────────

export interface DelayedReplyPayload {
  raw:              string;   // base64url-encoded RFC 2822 MIME message
  threadId:         string | null;
  replyToAddress:   string;
  subject:          string;
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // Verify QStash HMAC signature — reject anything that didn't come from QStash
  try {
    const isValid = await receiver.verify({
      signature: req.headers.get('upstash-signature') ?? '',
      body:      rawBody,
      url:       `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.gradewithkatana.com'}/api/email/send-reply`,
    });
    if (!isValid) {
      console.warn('email/send-reply: invalid QStash signature');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch (err) {
    console.error('email/send-reply: signature verification error', err);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: DelayedReplyPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
  }

  const { raw, threadId, replyToAddress, subject } = payload;

  try {
    const accessToken = await getGmailAccessToken();
    const sent = await sendGmailMessage(accessToken, raw, threadId);
    await storeThread(replyToAddress, sent.threadId);
    console.log(`email/send-reply: delayed reply sent re: "${subject}" → thread: ${sent.threadId}`);
  } catch (err) {
    console.error('email/send-reply: failed to send delayed reply', err);
    // Return 500 so QStash will retry
    return NextResponse.json({ error: 'Send failed' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
