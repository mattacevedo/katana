// lib/supabase/client.ts — browser-side Supabase client

import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  // PKCE is the default and only supported flow in @supabase/ssr 0.5+.
  // The callback route (app/auth/callback/route.ts) handles code exchange server-side.
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}
