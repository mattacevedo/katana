// lib/logActivity.ts
//
// Non-blocking helper to append a row to the activity_log table.
// Failures are silently swallowed — logging must never break the calling flow.
//
// ── SQL (run once in Supabase SQL editor) ───────────────────────────────────
//
//   CREATE TABLE IF NOT EXISTS public.activity_log (
//     id          bigserial PRIMARY KEY,
//     created_at  timestamptz DEFAULT now() NOT NULL,
//     event_type  text        NOT NULL,
//     summary     text        NOT NULL,
//     metadata    jsonb       DEFAULT '{}'::jsonb
//   );
//
//   CREATE INDEX IF NOT EXISTS idx_activity_log_created_at
//     ON public.activity_log (created_at DESC);
//
// ────────────────────────────────────────────────────────────────────────────

import { createAdminClient } from './supabase/admin';

// ── Metadata sanitizer ────────────────────────────────────────────────────────
// Only persist known, safe keys to the activity_log metadata JSONB column.
// This prevents callers from accidentally storing PII or large payloads.
const METADATA_ALLOWLIST = new Set([
  'plan', 'email', 'subject', 'messageId', 'from', 'to', 'action',
]);

function sanitizeMetadata(meta: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(meta)
      .filter(([k]) => METADATA_ALLOWLIST.has(k))
      .map(([k, v]) => {
        // Coerce all values to primitives; truncate strings to 500 chars
        if (typeof v === 'string') return [k, v.slice(0, 500)];
        if (typeof v === 'number' || typeof v === 'boolean') return [k, v];
        return [k, String(v).slice(0, 500)];
      })
  );
}

export type ActivityEventType =
  | 'email_auto_send'
  | 'email_needs_attention'
  | 'email_skip'
  | 'grade'
  | 'signup'
  | 'upgrade'
  | 'cancel'
  | 'reactivate'
  | 'payment_failed';

export async function logActivity(
  eventType: ActivityEventType,
  summary:   string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const admin = createAdminClient();
    await admin.from('activity_log').insert({
      event_type: eventType,
      summary:    summary.slice(0, 500), // cap summary length too
      metadata:   metadata ? sanitizeMetadata(metadata) : {},
    });
  } catch (err) {
    // Non-fatal — activity log is best-effort
    console.warn('logActivity: write failed (non-fatal)', err);
  }
}
