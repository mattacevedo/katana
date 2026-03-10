// app/api/email/inbound/route.ts
//
// Postmark inbound webhook handler — three-tier email triage.
//
// Claude classifies every inbound email into one of three actions:
//   auto_send      → straightforward FAQ / support question; reply sent immediately
//   needs_attention → refunds, complaints, escalations; draft created + "Needs Attention"
//                     label applied to the original inbox thread
//   skip           → automated notifications, system emails; no action taken
//
// Setup:
//   • Postmark webhook URL: https://www.gradewithkatana.com/api/email/inbound?secret=POSTMARK_WEBHOOK_SECRET
//   • GOOGLE_REFRESH_TOKEN must be set after running /api/email/oauth

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '../../../../lib/supabase/admin';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const PLAN_LIMITS: Record<string, number> = {
  free: 50, basic: 200, super: 1000, shogun: 2500,
};

const PLAN_LABELS: Record<string, string> = {
  free:   'Free (50 grades/period)',
  basic:  'Basic — $9.99/mo (200 grades/period)',
  super:  'Super — $19.99/mo (1,000 grades/period)',
  shogun: 'Shogun — $39.99/mo (2,500 grades/period)',
};

const NEEDS_ATTENTION_LABEL = 'Needs Attention';

// Hard skip: delivery failures and mail loops — never reply to these
const SKIP_SUBJECT_RE = /^(auto.?reply|out of office|delivery status|undelivered mail|bounce|mailer.daemon|mail delivery)/i;
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
  if (!data.access_token) throw new Error(`Failed to get Gmail access token: ${JSON.stringify(data)}`);
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

  return Buffer.from(lines.join('\r\n'))
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sendGmailMessage(accessToken: string, raw: string, threadId?: string | null): Promise<void> {
  const body: Record<string, string> = { raw };
  if (threadId) body.threadId = threadId;
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Gmail send error (${res.status}): ${await res.text()}`);
}

async function createGmailDraft(accessToken: string, raw: string, threadId?: string | null): Promise<void> {
  const message: Record<string, string> = { raw };
  if (threadId) message.threadId = threadId;
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`Gmail draft error (${res.status}): ${await res.text()}`);
}

// Get the "Needs Attention" label ID, creating it if it doesn't exist yet
async function getOrCreateLabel(accessToken: string, labelName: string): Promise<string> {
  const listRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  const { labels = [] } = await listRes.json() as { labels: { id: string; name: string }[] };
  const existing = labels.find(l => l.name === labelName);
  if (existing) return existing.id;

  const createRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/labels', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: labelName,
      labelListVisibility:   'labelShow',
      messageListVisibility: 'show',
    }),
  });
  const created = await createRes.json() as { id: string };
  return created.id;
}

// Search Gmail for the original inbound email by its RFC 2822 Message-ID.
// Returns the Gmail threadId so it can be reused for threading AND labeling.
async function findGmailThreadId(accessToken: string, messageId: string): Promise<string | null> {
  const searchId = messageId.startsWith('<') ? messageId : `<${messageId}>`;
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(`rfc822msgid:${searchId}`)}`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  const { messages = [] } = await res.json() as { messages?: { id: string; threadId: string }[] };
  if (!messages.length) {
    console.warn(`email/inbound: Gmail thread not found for Message-ID ${messageId}`);
    return null;
  }
  return messages[0].threadId;
}

async function applyLabelToThread(accessToken: string, threadId: string, labelId: string): Promise<void> {
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}/modify`,
    {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ addLabelIds: [labelId] }),
    }
  );
  if (!res.ok) {
    console.warn(`email/inbound: failed to apply label to thread ${threadId}: ${await res.text()}`);
  }
}

// Remove hard line breaks within paragraphs that Claude inserts for readability.
// Plain text emails display those as narrow columns — we want flowing paragraphs.
function normalizeLineBreaks(text: string): string {
  return text
    .split(/\n{2,}/)                       // split on blank lines (paragraph boundaries)
    .map(para => para.replace(/\n/g, ' ').trim())  // join single newlines within each paragraph
    .join('\n\n');                         // rejoin paragraphs with a blank line between them
}

// ── Supabase account lookup ────────────────────────────────────────────────

interface AccountInfo {
  id:                 string;
  plan:               string;
  grades_this_period: number;
  period_start:       string | null;
  member_since:       string | null;
}

async function lookupAccount(email: string): Promise<AccountInfo | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('lookup_profile_by_email', {
      p_email: email.toLowerCase(),
    });
    if (error) {
      console.warn('email/inbound: account lookup error', error.message);
      return null;
    }
    // RPC returns an array (RETURNS TABLE); take the first row
    const row = Array.isArray(data) ? data[0] : data;
    return row ?? null;
  } catch (err) {
    console.warn('email/inbound: account lookup threw', err);
    return null;
  }
}

function formatAccountContext(account: AccountInfo | null): string {
  if (!account) {
    return 'SENDER ACCOUNT:\n- Katana customer: No (email not found in our system)';
  }

  const plan       = account.plan || 'free';
  const limit      = PLAN_LIMITS[plan] ?? 50;
  const used       = account.grades_this_period ?? 0;
  const remaining  = Math.max(0, limit - used);
  const memberSince = account.member_since
    ? new Date(account.member_since).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : 'unknown';

  return [
    'SENDER ACCOUNT:',
    `- Katana customer: Yes`,
    `- Plan: ${PLAN_LABELS[plan] ?? plan}`,
    `- Grades used this period: ${used} of ${limit} (${remaining} remaining)`,
    `- Member since: ${memberSince}`,
  ].join('\n');
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
  const replyToAddress = ReplyTo || From;

  // 3. Hard-skip delivery failures and mail loops before calling Claude
  if (SKIP_SUBJECT_RE.test(Subject) || SKIP_SENDER_RE.test(From)) {
    console.log(`email/inbound: hard-skip (bounce/loop) from ${From}`);
    return NextResponse.json({ skipped: true, reason: 'bounce or auto-reply' });
  }

  const emailBody    = TextBody?.trim()
    || HtmlBody?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    || '[No body]';
  const senderDisplay = FromName ? `${FromName} <${replyToAddress}>` : replyToAddress;

  // 4. Look up whether the sender has a Katana account
  const account        = await lookupAccount(replyToAddress);
  const accountContext = formatAccountContext(account);

  // 5. Claude triage + draft (single API call)
  const systemPrompt = `You are an email support agent for Katana. You triage inbound emails and draft replies on behalf of the Katana team.

== ABOUT KATANA ==
Katana is an AI-powered grading assistant Chrome extension for Canvas LMS SpeedGrader.

How it works:
1. Instructor opens Canvas SpeedGrader on any assignment
2. Katana's side panel appears in Chrome
3. Click "Grade" — Katana reads the student's submission, assignment instructions, and rubric
4. Claude AI generates a grade, rubric ratings, and written feedback
5. Katana auto-fills all fields in Canvas — instructor reviews, edits if needed, and submits

Supported submission types: text submissions, PDF file uploads
Supported grading schemas: points, percentage, letter grade (A–F), GPA scale (4.0), pass/fail

Installation:
- Install from the Chrome Web Store (search "Katana SpeedGrader")
- Sign in or create a free account at gradewithkatana.com
- Navigate to any Canvas SpeedGrader page — the side panel opens automatically

Plans (grade quota resets every 30 days):
- Free: 50 grades/period — no credit card required
- Basic: $9.99/month — 200 grades/period
- Super: $19.99/month — 1,000 grades/period
- Shogun: $39.99/month — 2,500 grades/period
Upgrade at gradewithkatana.com/dashboard

Common questions & correct answers:
- "Does it work with Canvas?" → Yes, Canvas LMS / Instructure Canvas only (not Blackboard, Moodle, etc.)
- "Does it work with all assignment types?" → Text and PDF submissions; media submissions (video/audio) are not currently supported
- "Is my student data safe?" → Submissions are sent to Claude AI for grading and are not stored by Katana
- "Can I customize the feedback?" → Yes — tone, length, strictness, and custom instructions are all adjustable in the extension settings
- "How do I cancel?" → Log in at gradewithkatana.com/dashboard → account settings → cancel subscription
- "When does my quota reset?" → Every 30 days from your signup date
- "Can I upgrade mid-period?" → Yes, upgrades take effect immediately

== YOUR JOB ==
Classify each email into exactly one of three actions:

AUTO_SEND — Reply immediately, no human review needed. Use for:
- Questions clearly answered by the information above (pricing, how it works, installation, compatibility, cancellation)
- General curiosity / pre-sales questions
- Simple "thank you" emails that warrant a brief acknowledgment
- IMPORTANT: Only use auto_send when you are confident the answer is complete and accurate.
  If you are uncertain about any detail, use needs_attention instead.

NEEDS_ATTENTION — Stage a draft reply + flag for human review. Use for:
- Refund or billing dispute requests
- Reports of bugs or unexpected behavior
- Account access issues (can't log in, subscription not updating)
- Feature requests or partnership inquiries
- Complaints or frustrated users
- Anything where the correct answer is unclear or requires judgment
- Any email where getting it wrong would be costly

SKIP — Take no action. Use for:
- Automated notifications (Google Workspace, billing receipts, security alerts)
- Marketing emails, newsletters, promotional content
- Delivery receipts, read notifications
- Any email where a reply would be unwanted or inappropriate

== OUTPUT FORMAT ==
Respond ONLY with valid JSON — no explanation, no markdown fences.

For auto_send:
{"action":"auto_send","draft":"<full reply body — start with greeting e.g. Hi [Name], — sign off as The Katana Team>"}

For needs_attention:
{"action":"needs_attention","reason":"<one sentence — why this needs human review>","draft":"<draft reply body for the human to edit before sending>"}

For skip:
{"action":"skip","reason":"<one sentence — why no reply is needed>"}

Tone for all replies: Professional, warm, and concise. Address the person by first name if available.`;

  const userMessage = `Triage this email:

From: ${senderDisplay}
Subject: ${Subject}

${emailBody}

---
${accountContext}`;

  type TriageResult =
    | { action: 'auto_send';       draft: string }
    | { action: 'needs_attention'; reason: string; draft: string }
    | { action: 'skip';            reason: string };

  let triage: TriageResult;
  try {
    const response = await anthropic.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 1024,
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userMessage }],
    });

    const rawText = response.content[0]?.type === 'text' ? response.content[0].text : '';
    if (!rawText) throw new Error('Claude returned empty response.');

    triage = JSON.parse(rawText.trim()) as TriageResult;
  } catch (err) {
    console.error('email/inbound: Claude/parse error', err);
    return NextResponse.json({ error: 'AI triage failed.' }, { status: 500 });
  }

  // 6. Act on Claude's decision
  if (triage.action === 'skip') {
    console.log(`email/inbound: skip — ${triage.reason} (from: ${From}, subject: "${Subject}")`);
    return NextResponse.json({ action: 'skip', reason: triage.reason });
  }

  const replySubject = Subject.startsWith('Re:') ? Subject : `Re: ${Subject}`;
  const draft        = normalizeLineBreaks(triage.draft);

  let accessToken: string;
  try {
    accessToken = await getGmailAccessToken();
  } catch (err) {
    console.error('email/inbound: failed to get Gmail access token', err);
    return NextResponse.json({ error: 'Gmail authentication failed.' }, { status: 500 });
  }

  // Find the Gmail thread ID for the original email so we can explicitly thread
  // the reply/draft with it — prevents the sent message appearing as a new conversation.
  const threadId = await findGmailThreadId(accessToken, MessageID);

  const raw = buildRawMime({
    to:         replyToAddress,
    subject:    replySubject,
    body:       draft,
    inReplyTo:  MessageID,
    references: MessageID,
  });

  if (triage.action === 'auto_send') {
    try {
      await sendGmailMessage(accessToken, raw, threadId);
      console.log(`email/inbound: auto-sent reply to ${replyToAddress} re: "${Subject}" (thread: ${threadId ?? 'unknown'})`);
    } catch (err) {
      console.error('email/inbound: Gmail send error', err);
      return NextResponse.json({ error: 'Failed to send reply.' }, { status: 500 });
    }
    return NextResponse.json({ action: 'auto_send' });
  }

  // needs_attention: create draft + label the original inbox thread
  try {
    await createGmailDraft(accessToken, raw, threadId);
    console.log(`email/inbound: draft created for "${Subject}" from ${replyToAddress}`);
  } catch (err) {
    console.error('email/inbound: Gmail draft error', err);
    return NextResponse.json({ error: 'Failed to create Gmail draft.' }, { status: 500 });
  }

  try {
    const labelId = await getOrCreateLabel(accessToken, NEEDS_ATTENTION_LABEL);
    if (threadId) {
      await applyLabelToThread(accessToken, threadId, labelId);
      console.log(`email/inbound: "${NEEDS_ATTENTION_LABEL}" label applied — ${triage.reason}`);
    }
  } catch (err) {
    // Label failure is non-fatal — the draft is already created
    console.warn('email/inbound: label step failed (non-fatal)', err);
  }

  return NextResponse.json({ action: 'needs_attention', reason: triage.reason });
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
