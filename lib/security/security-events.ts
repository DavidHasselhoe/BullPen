// Security event audit log — see supabase/migrations/108_security_events.sql
// Fire-and-forget: a logging failure must never block or fail the request
// that triggered it.

import { createServerClient } from '@/lib/supabase/client';

export type SecurityEventType =
  | 'admin_access_denied'
  | 'cron_secret_mismatch'
  | 'auth_rate_limited'
  | 'account_lockout'
  | 'trial_abuse_blocked';

export function logSecurityEvent(
  eventType: SecurityEventType,
  fields: { userId?: string | null; identifier?: string | null; path?: string | null; metadata?: Record<string, unknown> }
): void {
  const supabase = createServerClient();
  supabase
    .from('security_events')
    .insert({
      event_type: eventType,
      user_id: fields.userId ?? null,
      identifier: fields.identifier ?? null,
      path: fields.path ?? null,
      metadata: fields.metadata ?? null,
    })
    .then(({ error }) => {
      if (error) console.error('[security-events] insert failed:', error.message);
    });
}
