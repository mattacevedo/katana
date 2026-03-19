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
    if (!EXTENSION_ID) {
      console.log('[ExtensionNotifier] EXTENSION_ID is empty — skipping');
      return;
    }

    async function notify() {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        console.log('[ExtensionNotifier] No session from getSession() — skipping');
        return;
      }

      console.log('[ExtensionNotifier] Sending AUTH_TOKEN_RECEIVED to', EXTENSION_ID);
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const cr = (window as any).chrome?.runtime;
        if (cr?.sendMessage) {
          const resp = await cr.sendMessage(EXTENSION_ID, {
            type: 'AUTH_TOKEN_RECEIVED',
            token: session.access_token,
            email: session.user.email,
            plan,
          });
          console.log('[ExtensionNotifier] Extension responded:', JSON.stringify(resp));
        } else {
          console.log('[ExtensionNotifier] chrome.runtime.sendMessage not available');
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('[ExtensionNotifier] sendMessage failed:', msg);
      }
    }

    notify();
  // plan is stable (server-rendered); run once on mount
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
