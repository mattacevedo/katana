// app/auth/signup/page.tsx
// Redirects to the unified sign-in page — sign-in and sign-up are the same
// flow with magic links (Supabase auto-creates accounts on first use).

import { redirect } from 'next/navigation';

export default function SignUpPage({
  searchParams,
}: {
  searchParams: Record<string, string | undefined>;
}) {
  const plan = searchParams?.plan;
  if (plan) {
    redirect(`/auth/signin?plan=${encodeURIComponent(plan)}`);
  }
  redirect('/auth/signin');
}
