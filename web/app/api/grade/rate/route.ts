// app/api/grade/rate/route.ts
//
// POST /api/grade/rate  { gradeSessionId: string, rating: 'up' | 'down' }
//
// Records a thumbs-up or thumbs-down for a specific grading result.
// gradeSessionId is a client-generated UUID — unique per grade result displayed.
// Upserts so users can change their rating.
// Auth: same Bearer token pattern as /api/grade.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(req: NextRequest) {
  if (!req.headers.get('content-type')?.includes('application/json')) {
    return json({ error: 'Content-Type must be application/json.' }, 415);
  }

  // Auth: validate Bearer token
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing authorization token.' }, 401);
  }

  const token = authHeader.slice(7);
  const supabase = createAdminClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return json({ error: 'Invalid or expired session.' }, 401);
  }

  // Parse body
  let body: { gradeSessionId?: string; rating?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON.' }, 400);
  }

  const { gradeSessionId, rating } = body;

  if (!gradeSessionId || typeof gradeSessionId !== 'string') {
    return json({ error: 'gradeSessionId is required.' }, 400);
  }
  // Basic UUID format check
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(gradeSessionId)) {
    return json({ error: 'gradeSessionId must be a valid UUID.' }, 400);
  }
  if (rating !== 'up' && rating !== 'down') {
    return json({ error: 'rating must be "up" or "down".' }, 400);
  }

  const { error } = await supabase
    .from('grade_ratings')
    .upsert(
      { grade_session_id: gradeSessionId, user_id: user.id, rating },
      { onConflict: 'grade_session_id' }
    );

  if (error) {
    console.error('grade/rate: DB error', error.message);
    return json({ error: 'Failed to save rating.' }, 500);
  }

  return json({ ok: true });
}
