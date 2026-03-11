// app/api/admin/activity/route.ts
//
// Server-Sent Events endpoint for the admin activity log.
// Polls activity_log every 3 s and streams new rows to the client.
// Protected by ADMIN_EMAIL env var — same guard as the admin page.

import { NextRequest } from 'next/server';
import { createClient as createServerClient } from '../../../../lib/supabase/server';
import { createAdminClient } from '../../../../lib/supabase/admin';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // ── Auth check ─────────────────────────────────────────────────────────────
  const serverSupabase = await createServerClient();
  const { data: { user } } = await serverSupabase.auth.getUser();

  const adminEmail = process.env.ADMIN_EMAIL ?? '';
  // Email comparison is case-insensitive per RFC 5321
  if (!user || !adminEmail || user.email?.toLowerCase() !== adminEmail.toLowerCase()) {
    return new Response('Unauthorized', { status: 401 });
  }

  const admin = createAdminClient();

  // Start cursor: last 15 minutes of history on initial connect
  const url    = new URL(req.url);
  const since  = url.searchParams.get('since')
    ?? new Date(Date.now() - 15 * 60 * 1000).toISOString();

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let cursor = since;
      let closed = false;

      const send = (data: unknown) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };

      const poll = async () => {
        if (closed) return;
        try {
          const { data: events, error } = await admin
            .from('activity_log')
            .select('id, created_at, event_type, summary, metadata')
            .gt('created_at', cursor)
            .order('created_at', { ascending: true })
            .limit(50);

          if (error) {
            if (error.code === '42P01') {
              // Table doesn't exist yet — inform the client and stop polling
              send({ __error: 'activity_log table not found — run the SQL migration in Supabase' });
            } else {
              // Any other DB error: log server-side but don't expose details to client
              console.error('admin/activity SSE: DB error', error.code, error.message);
              send({ __error: 'Database error — check server logs.' });
            }
            closed = true;
            try { controller.close(); } catch {}
            return;
          }

          if (events && events.length > 0) {
            for (const event of events) send(event);
            cursor = events[events.length - 1].created_at as string;
          }
        } catch (err) {
          console.error('admin/activity SSE: poll error', err);
        }
      };

      // Immediately send recent history, then poll every 3 s
      await poll();
      const interval = setInterval(poll, 3000);

      req.signal.addEventListener('abort', () => {
        closed = true;
        clearInterval(interval);
        try { controller.close(); } catch {}
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no', // disable Nginx buffering if proxied
    },
  });
}
