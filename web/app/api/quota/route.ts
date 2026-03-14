// app/api/quota/route.ts
// Returns the authenticated user's current plan, usage, and remaining grades.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '../../../lib/supabase/admin';

const PLAN_LIMITS: Record<string, number> = {
  free: 50,
  basic: 200,
  super: 1000,
  shogun: 2500,
};

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

export async function GET(req: NextRequest) {
  // 1. Validate Bearer token
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Missing authorization token.' }, 401);
  }

  const token = authHeader.slice(7);
  const supabase = createAdminClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) {
    return json({ error: 'Invalid or expired session. Please sign in again.' }, 401);
  }

  // 2. Fetch profile
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, grades_this_period, bonus_grades')
    .eq('id', user.id)
    .single();

  const plan       = profile?.plan || 'free';
  const limit      = PLAN_LIMITS[plan] ?? 50;
  const used       = profile?.grades_this_period ?? 0;
  const bonus      = profile?.bonus_grades ?? 0;
  const remaining  = Math.max(0, limit - used) + bonus;

  return json({ plan, limit, used, bonus, remaining });
}
