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
import { logActivity } from '../../../../lib/logActivity';

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
    `From: The Katana Team <hello@gradewithkatana.com>`,
    `To: ${params.to}`,
    `Subject: ${params.subject}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
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

async function createGmailDraft(
  accessToken: string, raw: string, threadId?: string | null
): Promise<{ id: string; message: { id: string; threadId: string } }> {
  const message: Record<string, string> = { raw };
  if (threadId) message.threadId = threadId;
  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error(`Gmail draft error (${res.status}): ${await res.text()}`);
  return res.json();
}

// ── Thread persistence (Supabase email_threads table) ─────────────────────
// Stores the Gmail threadId returned by the API after each send/draft, keyed
// by sender email. This sidesteps the Gmail rfc822msgid search which fails
// when Google Workspace re-envelopes forwarded messages with a new internal ID.

async function lookupStoredThread(senderEmail: string): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { data } = await supabase
      .from('email_threads')
      .select('gmail_thread_id')
      .eq('sender_email', senderEmail.toLowerCase())
      .single();
    return data?.gmail_thread_id ?? null;
  } catch {
    return null;
  }
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
    console.warn('email/inbound: failed to persist thread mapping (non-fatal)', err);
  }
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

// Search Gmail for a single RFC 2822 Message-ID and return the threadId.
// in:anywhere ensures we find it even if it landed in spam or Sent.
async function searchGmailByMsgId(accessToken: string, messageId: string): Promise<string | null> {
  const searchId = messageId.startsWith('<') ? messageId : `<${messageId}>`;
  const q        = `rfc822msgid:${searchId} in:anywhere`;
  const res = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(q)}`,
    { headers: { 'Authorization': `Bearer ${accessToken}` } }
  );
  const { messages = [] } = await res.json() as { messages?: { id: string; threadId: string }[] };
  return messages[0]?.threadId ?? null;
}

// Find the Gmail threadId for an inbound email.
//
// Strategy 1: search by the inbound message's own Message-ID.
//   Works when the inbound email has been delivered to the Gmail inbox
//   (e.g. Postmark is configured to forward, or domain MX points elsewhere).
//
// Strategy 2 (fallback): search by inReplyTo — the Message-ID of the email
//   the customer is replying to.  That message was sent by us via the Gmail
//   API and lives in the Sent folder, so it's always findable even if the
//   inbound email hasn't been indexed by Gmail yet (race condition).
async function findGmailThreadId(
  accessToken: string,
  messageId:   string,
  inReplyTo?:  string | null,
): Promise<string | null> {
  // Strategy 1
  const threadId = await searchGmailByMsgId(accessToken, messageId);
  if (threadId) {
    console.log(`email/inbound: thread found by MessageID → ${threadId}`);
    return threadId;
  }

  // Strategy 2 — use In-Reply-To to locate the previous outbound message
  if (inReplyTo) {
    const fallback = await searchGmailByMsgId(accessToken, inReplyTo);
    if (fallback) {
      console.log(`email/inbound: thread found via In-Reply-To fallback → ${fallback}`);
      return fallback;
    }
  }

  console.log(`email/inbound: thread NOT FOUND (msgid: ${messageId})`);
  return null;
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

// Strip markdown characters that Claude sometimes outputs despite instructions.
function stripMarkdown(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')               // fenced code blocks
    .replace(/`([^`]+)`/g, '$1')                   // inline code
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')           // **bold**
    .replace(/__([\s\S]+?)__/g, '$1')              // __bold__
    .replace(/\*(?!\*)([^*\n]+)\*(?!\*)/g, '$1')  // *italic*
    .replace(/_(?!_)([^_\n]+)_(?!_)/g, '$1')      // _italic_
    .replace(/^#{1,6}\s+(.+)$/gm, '$1')            // ## headers → plain text
    .replace(/^[ \t]*[-*+][ \t]+/gm, '• ')        // - bullet lists → bullet char
    .replace(/^[-*_]{3,}\s*$/gm, '')               // horizontal rules
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Convert plain text draft to HTML for email.
// Gmail strips <html>/<body> tags and their styles, so we put all styling
// on the inner <p> elements. No max-width — let Gmail's pane determine width.
function textToHtml(text: string): string {
  const clean = stripMarkdown(text);

  const escaped = clean
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  return escaped
    .split(/\n{2,}/)
    .map(para => {
      const content = para.replace(/\n/g, '<br>').trim();
      if (!content) return '';
      return `<p style="margin:0 0 16px 0;line-height:1.6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;color:#222">${content}</p>`;
    })
    .filter(Boolean)
    .join('');
}

// ── Thread history ─────────────────────────────────────────────────────────
// Fetches prior messages in the Gmail thread so Claude has conversation context.

interface GmailPart {
  mimeType: string;
  body?:    { data?: string };
  parts?:   GmailPart[];
}

interface GmailThreadMessage {
  id:      string;
  payload: GmailPart & { headers: { name: string; value: string }[] };
}

interface ConversationTurn {
  direction: 'inbound' | 'outbound';
  from:      string;
  body:      string;
}

// Recursively extract plain text from a MIME part tree.
// Prefers text/plain; falls back to stripped text/html.
function extractTextFromPart(part: GmailPart): string {
  if (part.mimeType === 'text/plain' && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url').toString('utf-8').trim();
  }
  if (part.mimeType === 'text/html' && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url')
      .toString('utf-8')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }
  if (part.parts?.length) {
    // For multipart/alternative, prefer the text/plain sub-part
    const plain = part.parts.find(p => p.mimeType === 'text/plain');
    if (plain) return extractTextFromPart(plain);
    for (const sub of part.parts) {
      const text = extractTextFromPart(sub);
      if (text) return text;
    }
  }
  return '';
}

// Fetch all prior messages in the thread (excludes the current incoming message
// which is always last). Returns up to 10 turns to keep context manageable.
async function fetchThreadHistory(
  accessToken: string,
  threadId:    string,
): Promise<ConversationTurn[]> {
  try {
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=full`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    if (!res.ok) return [];

    const thread = await res.json() as { messages: GmailThreadMessage[] };
    const prior  = thread.messages.slice(0, -1).slice(-10); // exclude current; cap at 10

    return prior.map(msg => {
      const header = (name: string) =>
        msg.payload.headers.find(h => h.name.toLowerCase() === name)?.value ?? '';

      const from      = header('from');
      const isOutbound = from.toLowerCase().includes('hello@gradewithkatana.com');
      const rawBody   = extractTextFromPart(msg.payload);

      // Trim each turn to 500 chars — enough for context without bloating the prompt
      const body = rawBody.slice(0, 500) + (rawBody.length > 500 ? '…' : '');

      return { direction: isOutbound ? 'outbound' : 'inbound', from, body };
    });
  } catch (err) {
    console.warn('email/inbound: failed to fetch thread history', err);
    return [];
  }
}

function formatThreadHistory(turns: ConversationTurn[]): string {
  if (!turns.length) return '';
  const lines = turns.map(t => {
    const speaker = t.direction === 'outbound' ? 'Katana (you)' : `Customer <${t.from}>`;
    return `[${speaker}]\n${t.body}`;
  });
  return `PRIOR CONVERSATION (oldest first):\n${lines.join('\n\n')}\n`;
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

// ── Escalation notifications ───────────────────────────────────────────────

// Basic RFC 5321 email format check — prevents header injection and invalid addresses.
const EMAIL_RE = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

// Read the comma/semicolon-separated escalation_emails setting from Supabase.
// Each address is validated before being returned to prevent header injection.
async function getEscalationEmails(): Promise<string[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'escalation_emails')
      .single();
    if (error || !data?.value) return [];
    return data.value
      .split(/[,;]/)
      .map((e: string) => e.trim())
      .filter((e: string) => e.length > 0 && e.length <= 254 && EMAIL_RE.test(e));
  } catch {
    return [];
  }
}

// Send a brief escalation notification email via Gmail to each recipient.
async function sendEscalationNotification(params: {
  accessToken:    string;
  toAddresses:    string[];
  fromName:       string;
  fromEmail:      string;
  originalSubject:string;
  preview:        string;
  reason:         string;
}): Promise<void> {
  const { accessToken, toAddresses, fromName, fromEmail, originalSubject, preview, reason } = params;
  if (!toAddresses.length) return;

  const notifText = [
    `A customer email has been flagged for your review.`,
    ``,
    `From:    ${fromName ? `${fromName} <${fromEmail}>` : fromEmail}`,
    `Subject: ${originalSubject}`,
    ``,
    `Reason flagged: ${reason}`,
    ``,
    `Preview:`,
    preview.slice(0, 400) + (preview.length > 400 ? '…' : ''),
    ``,
    `→ Review and send the draft in Gmail: https://mail.google.com`,
    ``,
    `— Katana Admin`,
  ].join('\n');

  const raw = buildRawMime({
    to:      toAddresses.join(', '),
    subject: `[Katana] 🔴 Escalation: ${originalSubject}`,
    body:    textToHtml(notifText),
  });

  try {
    await sendGmailMessage(accessToken, raw, null);
    console.log(`email/inbound: escalation notification sent to ${toAddresses.join(', ')}`);
  } catch (err) {
    // Non-fatal — draft was already created even if notification fails
    console.warn('email/inbound: escalation notification failed (non-fatal)', err);
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

  const { From, FromName, Subject = '', TextBody, HtmlBody, MessageID, ReplyTo, Headers = [] } = payload;
  const replyToAddress = ReplyTo || From;

  // Extract threading headers from the inbound email.
  // inboundInReplyTo: the Message-ID of the email the sender is replying to
  //                   (i.e. our previous outbound — lives in Gmail Sent).
  // inboundReferences: the full chain of prior Message-IDs.
  const hdr = (name: string) =>
    Headers.find(h => h.Name.toLowerCase() === name.toLowerCase())?.Value ?? null;
  const inboundInReplyTo  = hdr('In-Reply-To');
  const inboundReferences = hdr('References');

  // RFC 2822 Message-ID of the inbound email.
  // IMPORTANT: Postmark's top-level `MessageID` field is their own internal
  // tracking GUID (not an RFC 2822 Message-ID). The actual email Message-ID
  // (e.g. <abc123@gmail.com>) is in the Headers array under "Message-ID".
  // We use this for In-Reply-To and References so mail clients thread correctly.
  const inboundMsgId = hdr('Message-ID') ?? MessageID;

  console.log('[threading-debug]', JSON.stringify({
    postmarkGuid:    MessageID,
    headerMessageId: hdr('Message-ID'),
    inboundMsgId,
    inboundInReplyTo,
    inboundReferences,
  }));

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

Supported submission types: text submissions, PDF files, Word documents (.docx)
Not supported: legacy Word .doc files, Apple Pages .pages files, video/audio/image submissions
For .pages files: Apple Pages uses a proprietary binary format that cannot be parsed. Instructors should ask students to export as PDF (File → Export To → PDF) or Word (.docx) before submitting.
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
- "Does it work with all assignment types?" → Text, PDF, and Word (.docx) submissions are supported. Legacy .doc files and media submissions (video/audio/image) are not supported
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
- NEVER suggest the customer "reach out", "contact us", or "get in touch" in an auto_send reply.
  They already have — you are the support contact. If you don't know the answer, use needs_attention.

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
{"action":"auto_send","draft":"<full reply body — start with greeting e.g. Hi [Name], — end with a sign-off on its own line, exactly:\n\nBest,\nNaomi\nCustomer Success Advocate\nThe Katana Team>"}

For needs_attention:
{"action":"needs_attention","reason":"<one sentence — why this needs human review>","draft":"<draft reply body for the human to edit before sending — end with:\n\nBest,\nNaomi\nCustomer Success Advocate\nThe Katana Team>"}

For skip:
{"action":"skip","reason":"<one sentence — why no reply is needed>"}

If PRIOR CONVERSATION is present in the user message, use it to understand context — the customer may be following up on a previous issue, clarifying something, or escalating. Reference prior context naturally in your reply where relevant (e.g. "As we mentioned earlier…" or "Following up on your question about…").

Tone for all replies: Professional, warm, and concise. Address the person by first name if available.

SIGNATURE: Every draft (auto_send and needs_attention) must end with this exact sign-off block, separated from the body by a blank line:

Best,
Naomi
Customer Success Advocate
The Katana Team

FORMATTING: Plain prose only. No markdown — no asterisks for bold, no pound signs for headers, no backticks, no dashes for bullet lists. Use numbered lists (1. 2. 3.) sparingly if needed. Write as if composing an email, not a document.`;

  // 5a. Fetch Gmail access token + thread context before calling Claude
  //     so we can include conversation history in the prompt.
  let accessToken: string;
  try {
    accessToken = await getGmailAccessToken();
  } catch (err) {
    console.error('email/inbound: failed to get Gmail access token', err);
    return NextResponse.json({ error: 'Gmail authentication failed.' }, { status: 500 });
  }

  // Look up stored threadId from a previous exchange with this sender.
  // This is the primary threading mechanism — the Gmail rfc822msgid search is
  // unreliable when GW re-envelopes forwarded messages before Postmark delivery.
  const storedThreadId = await lookupStoredThread(replyToAddress);
  console.log('[threading-debug] storedThreadId:', storedThreadId);

  // Also search Gmail in case this is a fresh sender (no stored thread yet).
  const searchedThreadId = storedThreadId
    ? null  // skip search — we already have what we need
    : await findGmailThreadId(accessToken, inboundMsgId, inboundInReplyTo);
  console.log('[threading-debug] searchedThreadId:', searchedThreadId);

  const threadIdForHistory = storedThreadId ?? searchedThreadId;
  const threadHistory    = threadIdForHistory ? await fetchThreadHistory(accessToken, threadIdForHistory) : [];
  const threadHistoryStr = formatThreadHistory(threadHistory);

  const userMessage = [
    'Triage this email:',
    '',
    threadHistoryStr,          // empty string if first message in thread
    'LATEST MESSAGE:',
    `From: ${senderDisplay}`,
    `Subject: ${Subject}`,
    '',
    emailBody,
    '',
    '---',
    accountContext,
  ].join('\n');

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
  // Effective threadId: stored (most reliable) → searched → null (first-ever email).
  // After sending, we capture the Gmail API's returned threadId and store it,
  // so every subsequent email from this sender lands in the same thread.
  const threadId = storedThreadId ?? searchedThreadId;
  console.log('[threading-debug] threadId (effective):', threadId);

  if (triage.action === 'skip') {
    console.log(`email/inbound: skip — ${triage.reason} (from: ${From}, subject: "${Subject}")`);
    void logActivity('email_skip', `Skipped from ${replyToAddress} — ${triage.reason}`, { from: From, subject: Subject });
    return NextResponse.json({ action: 'skip', reason: triage.reason });
  }

  const replySubject = Subject.startsWith('Re:') ? Subject : `Re: ${Subject}`;
  const draft        = textToHtml(triage.draft);

  // Build the full References chain so both our Gmail and the recipient's mail
  // client can correctly thread this reply into the existing conversation.
  //
  // We collect every known Message-ID from the thread in chronological order:
  //   inboundReferences — the chain of prior IDs from the inbound email
  //                       (may be null if Postmark doesn't forward this header)
  //   inboundInReplyTo  — direct parent (our previous outbound, always in Sent)
  //   inboundMsgId      — the inbound email the customer just sent us
  //
  // Including inboundInReplyTo as a fallback ensures threading even when
  // Postmark omits the References header from the webhook payload.
  const outgoingReferences = [
    ...(inboundReferences ? inboundReferences.split(/\s+/) : []),
    inboundInReplyTo,
    inboundMsgId,
  ]
    .filter((id): id is string => Boolean(id))
    .filter((id, i, arr) => arr.indexOf(id) === i) // deduplicate
    .join(' ');

  const raw = buildRawMime({
    to:         replyToAddress,
    subject:    replySubject,
    body:       draft,
    inReplyTo:  inboundMsgId,   // RFC 2822 Message-ID of the email we're replying to
    references: outgoingReferences,
  });

  if (triage.action === 'auto_send') {
    try {
      const sent = await sendGmailMessage(accessToken, raw, threadId);
      console.log(`email/inbound: auto-sent reply re: "${Subject}" → thread: ${sent.threadId}`);
      // Persist the threadId so future emails from this sender land in the same thread
      await storeThread(replyToAddress, sent.threadId);
      void logActivity('email_auto_send', `Auto-replied to ${replyToAddress} re: "${Subject}"`, { from: From, subject: Subject });
    } catch (err) {
      console.error('email/inbound: Gmail send error', err);
      return NextResponse.json({ error: 'Failed to send reply.' }, { status: 500 });
    }
    return NextResponse.json({ action: 'auto_send' });
  }

  // needs_attention: create draft + label the original inbox thread
  void logActivity('email_needs_attention', `Flagged for review from ${replyToAddress} — ${triage.reason}`, { from: From, subject: Subject, reason: triage.reason });
  try {
    const draft = await createGmailDraft(accessToken, raw, threadId);
    const draftThreadId = draft.message?.threadId;
    console.log(`email/inbound: draft created for "${Subject}" → thread: ${draftThreadId}`);
    // Persist so future emails from this sender thread correctly
    if (draftThreadId) await storeThread(replyToAddress, draftThreadId);
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

  // Send escalation notification emails (non-blocking, non-fatal)
  void (async () => {
    try {
      const escalationAddresses = await getEscalationEmails();
      if (escalationAddresses.length) {
        await sendEscalationNotification({
          accessToken,
          toAddresses:     escalationAddresses,
          fromName:        FromName,
          fromEmail:       replyToAddress,
          originalSubject: Subject,
          preview:         emailBody,
          reason:          (triage as { reason: string }).reason,
        });
      }
    } catch (err) {
      console.warn('email/inbound: escalation notification failed (non-fatal)', err);
    }
  })();

  return NextResponse.json({ action: 'needs_attention', reason: triage.reason });
}

// ── Postmark inbound payload (relevant fields only) ────────────────────────
interface PostmarkHeader { Name: string; Value: string; }

interface PostmarkInbound {
  From:      string;
  FromName:  string;
  To:        string;
  ReplyTo?:  string;
  Subject:   string;
  TextBody?: string;
  HtmlBody?: string;
  MessageID: string;
  Headers?:  PostmarkHeader[];
}
