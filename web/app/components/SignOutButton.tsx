// app/components/SignOutButton.tsx
//
// Client component that handles sign-out from the web dashboard.
// Before submitting the signout form, it notifies the Chrome extension
// to clear its stored auth token so both stay in sync.

'use client';

import { useRef } from 'react';

const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || '';

export default function SignOutButton({ className }: { className?: string }) {
  const formRef = useRef<HTMLFormElement>(null);

  async function handleSignOut() {
    // Best-effort: tell the extension to clear its auth token
    if (EXTENSION_ID) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cr = (window as any).chrome?.runtime;
        if (cr?.sendMessage) {
          await cr.sendMessage(EXTENSION_ID, { type: 'SIGN_OUT' });
        }
      } catch (_) {
        // Extension not installed or unreachable — that's fine
      }
    }

    // Submit the signout form
    formRef.current?.submit();
  }

  return (
    <form ref={formRef} action="/auth/signout" method="post">
      <button type="button" onClick={handleSignOut} className={className}>
        Sign Out
      </button>
    </form>
  );
}
