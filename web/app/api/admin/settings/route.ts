// app/api/admin/settings/route.ts
//
// GET  /api/admin/settings        — read all admin settings
// POST /api/admin/settings        — upsert a single setting { key, value }
//
// Protected by ADMIN_EMAIL env var.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

// Allowlist of keys that may be written via this API.
// Add new settings keys here before using them in the app.
const ALLOWED_SETTINGS_KEYS = new Set(['escalation_emails']);

async function verifyAdmin() {
  const serverSupabase = await createServerClient();
  const { data: { user } } = await serverSupabase.auth.getUser();
  if (!user) return null;
  const adminEmail = process.env.ADMIN_EMAIL || '';
  // Email comparison is case-insensitive per RFC 5321
  if (!adminEmail || user.email?.toLowerCase() !== adminEmail.toLowerCase()) return null;
  return user;
}

export async function GET() {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.from('admin_settings').select('key, value');

  if (error) {
    // Table may not exist yet — return empty
    return NextResponse.json({});
  }

  const settings: Record<string, string> = {};
  (data ?? []).forEach((row: { key: string; value: string }) => {
    settings[row.key] = row.value;
  });

  return NextResponse.json(settings);
}

export async function POST(req: NextRequest) {
  if (!await verifyAdmin()) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!req.headers.get('content-type')?.includes('application/json')) {
    return NextResponse.json({ error: 'Content-Type must be application/json.' }, { status: 415 });
  }

  let body: { key?: string; value?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { key, value } = body;
  if (!key || typeof value !== 'string') {
    return NextResponse.json({ error: 'key and value are required' }, { status: 400 });
  }
  if (!ALLOWED_SETTINGS_KEYS.has(key)) {
    return NextResponse.json({ error: `Unknown setting key: "${key}"` }, { status: 400 });
  }

  const admin = createAdminClient();
  const { error } = await admin
    .from('admin_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
