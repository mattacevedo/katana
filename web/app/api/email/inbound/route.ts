// app/api/email/inbound/route.ts
//
// Postmark inbound webhook handler.
//
// Flow:
//   Email → hello@gradewithkatana.com
//   → Google Workspace forwards copy to Postmark inbound address
//   → Postmark parses and POSTs to this endpoint
//   → We call Claude to draft a reply
//   → We create a Gmail draft via the Gmail API (draft-first, never auto-sends)
//
// Setup:
//   • Postmark webhook URL must include the secret:
//       https://www.gradewithkatana.com/api/email/inbound?secret=POSTMARK_WEBHOOK_SECRET
//   • GOOGLE_REFRESH_TOKEN must be set after running the one-time OAuth flow at
//       /api/email/oauth

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// Skip auto-replies and bounces to prevent loops
const SKIP_SUBJECT_RE = /^(auto.?reply|out of office|delivery status|undelivered|bounce|mailer.daemon)/i;
const SKIP_SENDER_RE  = /^(mailer-daemon|postmaster|no-reply|noreply)@/i;

// ── Gmail helpers ──────────────────────────────────────────────────────────

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
  if (!data.access_token) {
    throw new Error(`Failed to get Gmail access token: ${JSON.stringify(data)}`);
  }
  return data.access_token;
}

function buildRawMime(params: {
  to:          string;
  subject:     string;
  body:        string;
  inReplyTo?:  string;
  references?: string;
}): string {
  const lines = [
    `From: Katana <hello@gradewithkatana.com>`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
  ];

  if (params.inReplyTo)  lines.push(`In-Reply-To: ${params.inReplyTo}`);
  if (params.references) lines.push(`References: ${params.references}`);

  lines.push('', params.body);

  // Gmail API requires URL-safe base64 (base64url)
  return Buffer.from(lines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function createGmailDraft(accessToken: string, raw: string): Promise<void> {
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ message: { raw } }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail API error (${res.status}): ${err}`);
  }
}

// ── Main handler ───────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  // 1. Verify webhook secret
  const secret = req.nextUrl.searchParams.get('secret');
  if (!secret || secret !== process.env.POSTMARK_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  // 2. Parse Postmark payload
  let payload: PostmarkInbound;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON.' }, { status: 400 });
  }

  const { From, FromName, Subject = '', TextBody, HtmlBody, MessageID, ReplyTo } = payload;

  // Use Reply-To if present (some senders set this), otherwise use From
  const replyToAddress = ReplyTo || From;

  // 3. Skip auto-replies and delivery notifications
  if (SKIP_SUBJECT_RE.test(Subject) || SKIP_SENDER_RE.test(From)) {
    console.log(`email/inbound: skipping auto-reply/bounce from ${From}`);
    return NextResponse.json({ skipped: true });
  }

  // Strip HTML tags if no plain text body available
  const emailBody = TextBody?.trim()
    || HtmlBody?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    || '[No body]';

  const senderDisplay = FromName ? `${FromName} <${replyToAddress}>` : replyToAddress;

  // 4. Draft a reply with Claude
  const systemPrompt = `You are a support agent for Katana, an AI grading assistant Chrome extension for Canvas LMS SpeedGrader. You draft email replies on behalf of the Katana team.

About Katana:
- Chrome extension that helps instructors grade student work in Canvas SpeedGrader
- AI reads the submission, rubric, and assignment instructions, then fills in the grade, rubric ratings, and written feedback in one click
- Plans: Free (50 grades/period), Basic ($9.99/mo, 200 grades), Super ($19.99/mo, 1,000 grades), Shogun ($39.99/mo, 2,500 grades)
- Website: gradewithkatana.com

Tone: Professional, warm, and concise. Sign off as "The Katana Team".

Write ONLY the reply body — no subject line, no headers. Start directly with the greeting (e.g. "Hi [Name],").`;

  const userMessage = `Draft a reply to this support email:

From: ${senderDisplay}
Subject: ${Subject}

${emailBody}`;

  let draftBody: string;
  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }],
    });

    draftBody = response.content[0]?.type === 'text' ? response.content[0].text : '';
    if (!draftBody) throw new Error('Claude returned empty response.');
  } catch (err) {
    console.error('email/inbound: Claude error', err);
    return NextResponse.json({ error: 'AI draft generation failed.' }, { status: 500 });
  }

  // 5. Create Gmail draft (never auto-sends)
  try {
    const accessToken    = await getGmailAccessToken();
    const replySubject   = Subject.startsWith('Re:') ? Subject : `Re: ${Subject}`;
    const raw            = buildRawMime({
      to:         replyToAddress,
      subject:    replySubject,
      body:       draftBody,
      inReplyTo:  MessageID,
      references: MessageID,
    });

    await createGmailDraft(accessToken, raw);
    console.log(`email/inbound: draft created for "${Subject}" from ${replyToAddress}`);
  } catch (err) {
    console.error('email/inbound: Gmail draft error', err);
    return NextResponse.json({ error: 'Failed to create Gmail draft.' }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

// ── Postmark inbound payload (relevant fields only) ────────────────────────
interface PostmarkInbound {
  From:      string;
  FromName:  string;
  To:        string;
  ReplyTo?:  string;
  Subject:   string;
  TextBody?: string;
  HtmlBody?: string;
  MessageID: string;
}
