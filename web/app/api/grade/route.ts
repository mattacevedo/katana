// app/api/grade/route.ts
// The heart of the SaaS backend.
// Validates auth token → checks quota → calls Claude → returns result.
// The extension POSTs here instead of calling Claude directly.

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '../../../lib/supabase/admin';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Quota limits per plan ────────────────────────────────────────────────
const PLAN_LIMITS: Record<string, number> = {
  free: 50,
  basic: 200,
  super: 1000,
  shogun: 2500,
};

// ─── Allowlists ───────────────────────────────────────────────────────────
const ALLOWED_MODELS = new Set(['claude-sonnet-4-6', 'claude-opus-4-5']);
const ALLOWED_MIME_TYPES = new Set(['application/pdf']);
const MAX_CUSTOM_INSTRUCTIONS  = 1000;           // chars
const MAX_FILE_BYTES           = 20 * 1024 * 1024; // 20 MB per attachment
const MAX_ASSIGNMENT_TITLE     = 500;
const MAX_STUDENT_NAME         = 200;
const MAX_INSTRUCTIONS         = 50_000;
const MAX_SUBMISSION_CONTENT   = 100_000;

// ─── Rate limiter (Upstash Redis) ─────────────────────────────────────────
// Activates only when env vars are present so the app degrades gracefully
// if Redis isn't configured yet. Set UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN in Vercel to enable.
//
// Limits: 20 grading requests per user per 10 minutes.
// This is well above normal usage but stops token-exhaustion abuse.
const ratelimit = (
  process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN
)
  ? new Ratelimit({
      redis: new Redis({
        url:   process.env.UPSTASH_REDIS_REST_URL,
        token: process.env.UPSTASH_REDIS_REST_TOKEN,
      }),
      limiter: Ratelimit.slidingWindow(20, '10 m'),
      analytics: false,
      prefix: 'katana:rl',
    })
  : null;

export async function POST(req: NextRequest) {
  // 0. Content-Type guard
  if (!req.headers.get('content-type')?.includes('application/json')) {
    return json({ error: 'Content-Type must be application/json.' }, 415);
  }

  // 1. Auth: validate Bearer token via Supabase
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing authorization token.' }, 401);
  }

  const token = authHeader.slice(7);
  // Use the admin client to validate the Bearer token from the extension.
  // The extension doesn't send cookies — it sends the session access_token directly.
  const supabase = createAdminClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return json({ error: 'Invalid or expired session. Please sign in again.' }, 401);
  }

  // 2. Rate limit: 20 requests per user per 10 minutes (when Redis is configured)
  if (ratelimit) {
    const { success, limit: rlLimit, remaining: rlRemaining, reset: rlReset } = await ratelimit.limit(user.id);
    if (!success) {
      const retryAfterSecs = Math.ceil((rlReset - Date.now()) / 1000);
      return new NextResponse(
        JSON.stringify({ error: 'Too many requests. Please wait a moment before grading again.' }),
        {
          status: 429,
          headers: {
            'Content-Type': 'application/json',
            'X-RateLimit-Limit': String(rlLimit),
            'X-RateLimit-Remaining': String(rlRemaining),
            'Retry-After': String(retryAfterSecs),
          },
        }
      );
    }
  }

  // 3. Check quota: fetch plan to determine the limit
  //    Upsert ensures a profile row always exists (handles brand-new users).
  const { data: profile } = await supabase
    .from('profiles')
    .upsert({ id: user.id }, { onConflict: 'id', ignoreDuplicates: true })
    .select('plan, grades_this_period, period_start')
    .eq('id', user.id)
    .single();

  const plan = profile?.plan || 'free';
  const limit = PLAN_LIMITS[plan] ?? 50;

  // 3. Parse request body
  let body: { submissionData: unknown; settings: unknown };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }

  const { submissionData, settings } = body as {
    submissionData: SubmissionData;
    settings: GradingSettings;
  };

  // 4a. Input validation — reject anything outside the allowlists
  if (settings.model && !ALLOWED_MODELS.has(settings.model)) {
    return json({ error: 'Invalid model specified.' }, 400);
  }
  if (
    settings.customInstructions &&
    settings.customInstructions.length > MAX_CUSTOM_INSTRUCTIONS
  ) {
    return json(
      { error: `Custom instructions must be ${MAX_CUSTOM_INSTRUCTIONS} characters or fewer.` },
      400
    );
  }
  const attachments = (submissionData?.submission?.fileAttachments ?? []) as FileAttachment[];
  for (const f of attachments) {
    if (!ALLOWED_MIME_TYPES.has(f.mediaType)) {
      return json({ error: `Unsupported file type: ${f.mediaType}. Only PDF is supported.` }, 400);
    }
    // Reject files larger than 20 MB (base64-decoded size)
    const byteLength = Math.floor(f.base64.length * 0.75);
    if (byteLength > MAX_FILE_BYTES) {
      return json({ error: 'Attached file exceeds the 20 MB limit.' }, 400);
    }
  }

  // 4b. Length limits on unbounded text fields — prevent prompt-injection via
  //     oversized payloads and protect the Claude context window / token budget.
  if (submissionData?.assignmentTitle &&
      submissionData.assignmentTitle.length > MAX_ASSIGNMENT_TITLE) {
    return json({ error: `Assignment title must be ${MAX_ASSIGNMENT_TITLE} characters or fewer.` }, 400);
  }
  if (submissionData?.studentName &&
      submissionData.studentName.length > MAX_STUDENT_NAME) {
    return json({ error: `Student name must be ${MAX_STUDENT_NAME} characters or fewer.` }, 400);
  }
  if (submissionData?.assignmentInstructions &&
      submissionData.assignmentInstructions.length > MAX_INSTRUCTIONS) {
    return json({ error: `Assignment instructions must be ${MAX_INSTRUCTIONS.toLocaleString()} characters or fewer.` }, 400);
  }
  if (submissionData?.submission?.content &&
      submissionData.submission.content.length > MAX_SUBMISSION_CONTENT) {
    return json({ error: `Submission content must be ${MAX_SUBMISSION_CONTENT.toLocaleString()} characters or fewer.` }, 400);
  }

  // 4. Atomically claim one quota slot before calling Claude.
  //    Uses a Postgres RPC that does CHECK + INCREMENT in one statement,
  //    preventing the TOCTOU race condition from concurrent requests.
  const { data: allowed, error: rpcError } = await supabase.rpc('increment_grade_count', {
    p_user_id: user.id,
    p_limit:   limit,
  });

  if (rpcError) {
    console.error('Katana /api/grade: increment_grade_count RPC error', rpcError);
    return json({ error: 'Failed to verify quota. Please try again.' }, 500);
  }

  if (!allowed) {
    return json({
      error: `You've used all ${limit} grades for this period. Upgrade your plan at gradewithkatana.com to continue grading.`
    }, 402);
  }

  // 5. Build prompts and call Claude
  const { systemPrompt, userMessage } = buildPrompts(submissionData, settings);
  const fileAttachments = attachments; // already validated above

  let result: GradeResult;
  try {
    result = await callClaude(systemPrompt, userMessage, fileAttachments, settings.model);
  } catch (err: unknown) {
    // Roll back the quota slot we just claimed — Claude failed, grade not consumed
    await supabase
      .from('profiles')
      .update({ grades_this_period: (profile?.grades_this_period ?? 0) })
      .eq('id', user.id);
    console.error('Katana /api/grade: Claude error', err);
    return json({ error: 'Failed to grade the submission. Please try again.' }, 500);
  }

  // Quota was already incremented atomically before the Claude call.
  return json(result);
}

// ─── Claude call ──────────────────────────────────────────────────────────
async function callClaude(
  systemPrompt: string,
  userMessage: string,
  fileAttachments: FileAttachment[],
  model = 'claude-sonnet-4-6'
): Promise<GradeResult> {
  // Defence-in-depth: enforce allowlist even if caller skips prior validation
  const safeModel = ALLOWED_MODELS.has(model) ? model : 'claude-sonnet-4-6';
  const userContent: Anthropic.MessageParam['content'] = fileAttachments.length > 0
    ? [
        ...fileAttachments.map(f => ({
          type: 'document' as const,
          source: { type: 'base64' as const, media_type: f.mediaType as 'application/pdf', data: f.base64 }
        })),
        { type: 'text' as const, text: userMessage }
      ]
    : userMessage;

  const response = await anthropic.messages.create({
    model: safeModel,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
    ...(fileAttachments.length > 0 ? { betas: ['pdfs-2024-09-25'] } : {})
  });

  const rawText = response.content[0]?.type === 'text' ? response.content[0].text : '';
  if (!rawText) throw new Error('Empty response from Claude.');

  const jsonText = rawText.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();

  let parsed: GradeResult;
  try {
    parsed = JSON.parse(jsonText) as GradeResult;
  } catch {
    throw new Error('Claude returned malformed JSON.');
  }

  if (!parsed.grade || !parsed.feedback) {
    throw new Error('Claude response missing required fields.');
  }

  return parsed;
}

// ─── Prompt builder (identical logic to prototype SW) ─────────────────────
function buildPrompts(data: SubmissionData, settings: GradingSettings) {
  const tone = settings.tone || 'professional';
  const feedbackLength = settings.feedbackLength || 3;
  const strictness = settings.strictness || 3;

  const feedbackLengthDescriptions: Record<number, string> = {
    1: 'Keep the feedback very short — around 50–75 words total.',
    2: 'Keep the feedback brief — around 75–125 words total.',
    3: 'Write a standard-length feedback — around 125–200 words total.',
    4: 'Write detailed feedback — around 200–300 words total.',
    5: 'Write comprehensive feedback — 300+ words, covering all aspects thoroughly.'
  };

  const toneDescriptions: Record<string, string> = {
    professional: 'professional and formal — use clear, precise academic language',
    casual: 'casual and conversational — write as if talking to a peer',
    encouraging: 'warm and encouraging — highlight strengths prominently and frame every area for improvement as a growth opportunity',
    socratic: 'Socratic — pose guiding questions that lead the student to discover insights themselves',
    skeptical: "critically analytical — probe the student's reasoning, question assumptions",
    samurai: 'like a wise Japanese samurai master — speak with calm authority and measured brevity; use occasional metaphors of discipline, craft, and the path of mastery (道)'
  };

  const strictnessDescriptions: Record<number, string> = {
    1: 'Be lenient and generous. Give the benefit of the doubt wherever reasonable.',
    2: 'Lean toward leniency. Be supportive and award partial credit generously when the intent is clear.',
    3: 'Be fair and balanced. Apply the rubric as written without leaning lenient or strict.',
    4: 'Be firm. Hold students to the stated requirements.',
    5: 'Be rigorous and exacting. Apply the rubric strictly; do not award points for work that does not clearly meet each criterion.'
  };

  const greetingInstruction = settings.greetByFirstName
    ? `\nOpen the feedback by addressing the student by first name ("${data.studentName?.split(' ')[0] || 'Student'}").`
    : '\nDo not open with a greeting. Begin the feedback directly with your evaluation.';

  const { gradingType, maxPoints } = data.gradingSchema || { gradingType: 'points', maxPoints: 100 };
  let schemaDesc = '';
  switch (gradingType) {
    case 'points':   schemaDesc = `points — a number from 0 to ${maxPoints}. CRITICAL: never exceed ${maxPoints}.`; break;
    case 'percent':  schemaDesc = 'percentage — a number from 0 to 100. CRITICAL: never exceed 100.'; break;
    case 'letter_grade': schemaDesc = 'letter grade (A, A-, B+, B, B-, C+, C, C-, D+, D, D-, F)'; break;
    case 'gpa_scale': schemaDesc = 'GPA scale (4.0, 3.7, 3.3, 3.0, 2.7, 2.3, 2.0, 1.7, 1.3, 1.0, 0.0)'; break;
    case 'pass_fail': schemaDesc = 'pass/fail — exactly "complete" or "incomplete"'; break;
    default: schemaDesc = `points — a number from 0 to ${maxPoints || 100}.`;
  }

  const systemPrompt = `You are helping an instructor write feedback for student work. Write as if the instructor is speaking directly to the student.

Grading schema: ${schemaDesc}
Grading strictness: ${strictnessDescriptions[strictness]}
Feedback tone: ${toneDescriptions[tone]}
Feedback length: ${feedbackLengthDescriptions[feedbackLength]}${greetingInstruction}${settings.customInstructions ? `\nAdditional instructor instructions: ${settings.customInstructions}` : ''}

CRITICAL WRITING RULES:
- Never use the em dash character (—).
- Write naturally — avoid phrasing that sounds AI-generated.
- Address the student directly.

Respond ONLY with valid JSON:
{
  "grade": "<value matching the grading schema>",
  "feedback": "<feedback addressed directly to the student>",
  "rubric_ratings": [{"criterion_id": "...", "points": <number>, "comments": "..."}],
  "grading_rationale": "<2-4 sentence internal explanation for the instructor>",
  "confidence": "<high | medium | low>",
  "confidence_reason": "<one sentence, only if confidence is medium or low>"
}

If no rubric is present, set rubric_ratings to [].
Omit confidence_reason entirely if confidence is high.`;

  let rubricSection = 'No rubric provided.';
  if (data.rubric?.criteria?.length) {
    rubricSection = data.rubric.criteria.map((c: RubricCriterion) => {
      const ratings = c.ratings.map((r: RubricRating) => `  - ${r.description} (${r.points} pts)`).join('\n');
      return `Criterion "${c.description}" [id: ${c.id}] (max ${c.maxPoints} pts):\n${ratings}`;
    }).join('\n\n');
  }

  const hasAttachments = (data.submission?.fileAttachments?.length ?? 0) > 0;
  const submissionBody = hasAttachments
    ? '[The student\'s file(s) are attached as document(s) above — read them to evaluate the submission.]'
    : (data.submission?.content || '[No readable content available]');

  const userMessage = `Assignment: ${data.assignmentTitle || 'Untitled'}

Assignment Instructions:
${data.assignmentInstructions || 'No instructions provided.'}

Rubric:
${rubricSection}

Student: ${data.studentName || 'Unknown Student'}
Submission Type: ${data.submission?.type || 'unknown'}

Student Submission:
${submissionBody}`;

  return { systemPrompt, userMessage };
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function json(body: object, status = 200) {
  return NextResponse.json(body, { status });
}

// ─── Types ────────────────────────────────────────────────────────────────
interface FileAttachment { name: string; base64: string; mediaType: string; }
interface RubricRating { id: string; description: string; points: number; }
interface RubricCriterion { id: string; description: string; maxPoints: number; ratings: RubricRating[]; }
interface GradingSchema { gradingType: string; maxPoints: number; }

interface SubmissionData {
  assignmentTitle?: string;
  assignmentInstructions?: string;
  rubric?: { criteria: RubricCriterion[] };
  gradingSchema?: GradingSchema;
  studentName?: string;
  submission?: { type: string; content?: string; fileAttachments?: FileAttachment[] };
  dueAt?: string;
  submittedAt?: string;
}

interface GradingSettings {
  model?: string;
  tone?: string;
  feedbackLength?: number;
  strictness?: number;
  greetByFirstName?: boolean;
  customInstructions?: string;
  lateDeduction?: boolean;
  lateDeductionPerDay?: number;
}

interface GradeResult {
  grade: string;
  feedback: string;
  rubric_ratings: Array<{ criterion_id: string; points: number; comments: string }>;
  grading_rationale: string;
  confidence: 'high' | 'medium' | 'low';
  confidence_reason?: string;
}
