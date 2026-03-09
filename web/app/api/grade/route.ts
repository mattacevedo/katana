// app/api/grade/route.ts
// The heart of the SaaS backend.
// Validates auth token → checks quota → calls Claude → returns result.
// The extension POSTs here instead of calling Claude directly.

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { createAdminClient } from '../../../lib/supabase/admin';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// ─── Quota limits per plan ────────────────────────────────────────────────
const PLAN_LIMITS: Record<string, number> = {
  free: 50,
  basic: 200,
  super: 1000,
  shogun: 2500,
};

export async function POST(req: NextRequest) {
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

  // 2. Check quota: count grades used this billing period
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, grades_this_period, period_start')
    .eq('id', user.id)
    .single();

  const plan = profile?.plan || 'free';
  const limit = PLAN_LIMITS[plan] ?? 50;
  const used = profile?.grades_this_period ?? 0;

  if (used >= limit) {
    return json({
      error: `You've used all ${limit} grades for this period. Upgrade your plan at gradewithkatana.com to continue grading.`
    }, 402);
  }

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

  // 4. Build prompts and call Claude
  const { systemPrompt, userMessage } = buildPrompts(submissionData, settings);
  const fileAttachments = (submissionData.submission?.fileAttachments ?? []) as FileAttachment[];

  let result: GradeResult;
  try {
    result = await callClaude(systemPrompt, userMessage, fileAttachments, settings.model);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Claude API error.';
    console.error('Katana /api/grade: Claude error', message);
    return json({ error: `AI error: ${message}` }, 500);
  }

  // 5. Increment usage counter
  await supabase
    .from('profiles')
    .update({ grades_this_period: used + 1 })
    .eq('id', user.id);

  return json(result);
}

// ─── Claude call ──────────────────────────────────────────────────────────
async function callClaude(
  systemPrompt: string,
  userMessage: string,
  fileAttachments: FileAttachment[],
  model = 'claude-sonnet-4-6'
): Promise<GradeResult> {
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
    model,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: 'user', content: userContent }],
    ...(fileAttachments.length > 0 ? { betas: ['pdfs-2024-09-25'] } : {})
  });

  const rawText = response.content[0]?.type === 'text' ? response.content[0].text : '';
  if (!rawText) throw new Error('Empty response from Claude.');

  const jsonText = rawText.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/i, '').trim();
  const parsed = JSON.parse(jsonText) as GradeResult;

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
