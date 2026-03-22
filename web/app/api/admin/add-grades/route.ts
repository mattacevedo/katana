// app/api/admin/add-grades/route.ts
//
// POST /api/admin/add-grades  { email: string, amount: number }
// Looks up the user by email and credits bonus grades via add_bonus_grades RPC.
// Protected by ADMIN_EMAIL env var.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

async function verifyAdmin() {
  const serverSupabase = await createServerClient();
  const { data: { user } } = await serverSupabase.auth.getUser();
  if (!user) return null;
  const adminEmail = process.env.ADMIN_EMAIL || '';
  if (!adminEmail || user.email?.toLowerCase() !== adminEmail.toLowerCase()) return null;
  return user;
}

export async function POST(req: NextRequest) {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { email?: string; amount?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { email, amount } = body;
  if (!email || typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount)) {
    return NextResponse.json({ error: 'email and a positive integer amount are required' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Look up user by email
  const { data: { users }, error: lookupErr } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (lookupErr) {
    return NextResponse.json({ error: 'Failed to look up users' }, { status: 500 });
  }

  const target = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  if (!target) {
    return NextResponse.json({ error: `No user found with email: ${email}` }, { status: 404 });
  }

  const { error: rpcErr } = await admin.rpc('add_bonus_grades', {
    p_user_id: target.id,
    p_amount: amount,
  });

  if (rpcErr) {
    return NextResponse.json({ error: rpcErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, userId: target.id, email: target.email, amount });
}
