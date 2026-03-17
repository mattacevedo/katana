// app/components/ExtensionNotifier.tsx
//
// Client component that notifies the Chrome extension whenever a logged-in user
// loads a page. Fires once on mount, best-effort — silently ignores errors if
// the extension is not installed or reachable.
//
// Used on the dashboard so that web logins (magic link → /dashboard) also update
// the extension's stored auth token, keeping the web session and extension in sync.

'use client';

import { useEffect } from 'react';
import { createClient } from '../../lib/supabase/client';

const EXTENSION_ID = process.env.NEXT_PUBLIC_EXTENSION_ID || '';

export default function ExtensionNotifier({ plan }: { plan: string }) {
  useEffect(() => {
    if (!EXTENSION_ID) return;

    async function notify() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cr = (window as any).chrome?.runtime;
        if (cr?.sendMessage) {
          await cr.sendMessage(EXTENSION_ID, {
            type: 'AUTH_TOKEN_RECEIVED',
            token: session.access_token,
            email: session.user.email,
            plan,
          });
        }
      } catch { /* extension not installed or not reachable */ }
    }

    notify();
  // plan is stable (server-rendered); run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
