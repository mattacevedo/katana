// app/auth/signout/route.ts
// Handles sign-out for the web dashboard.
// The dashboard has a form that POSTs here; we clear the session and redirect.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/auth/signin', req.url));
}
