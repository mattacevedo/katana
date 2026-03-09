// lib/supabase/admin.ts
// Service-role client — bypasses RLS, server-side only.
// Used in API routes that receive a Bearer token from the extension
// (not a cookie-based session).

import { createClient } from '@supabase/supabase-js';

export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
