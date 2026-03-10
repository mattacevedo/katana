// app/auth/signup/page.tsx
// Redirects to the unified sign-in page — sign-in and sign-up are the same
// flow with magic links (Supabase auto-creates accounts on first use).
// Next.js 15: searchParams is a Promise and must be awaited.

import { redirect } from 'next/navigation';

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const plan = params?.plan;
  if (plan) {
    redirect(`/auth/signin?plan=${encodeURIComponent(plan)}`);
  }
  redirect('/auth/signin');
}
