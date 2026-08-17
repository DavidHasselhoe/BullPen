-- 108_security_events.sql
-- Security audit finding: there was no audit trail anywhere in the app —
-- failed admin-route probes, cron-secret mismatches, and auth-throttle trips
-- were all silently dropped, with no way to later investigate a
-- credential-stuffing run or an admin-route probing pattern. This table is a
-- narrow, append-only log for exactly those signals (not a general request
-- log — that stays with Vercel/Supabase platform logs).
--
-- Same shape as contact_submissions/instagram_posts: RLS enabled, zero
-- policies. Every write goes through the service-role client
-- (lib/security/security-events.ts), and every read goes through the admin
-- dashboard (app/api/admin/security-events), which is gated by isAdmin()
-- server-side on the service-role client — same pattern as
-- app/api/admin/costs and app/api/admin/feedback.
CREATE TABLE public.security_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type  TEXT NOT NULL, -- 'admin_access_denied' | 'cron_secret_mismatch' | 'auth_rate_limited'
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  identifier  TEXT, -- email/IP/other free-form identifier, depending on event_type
  path        TEXT,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_security_events_created_at ON public.security_events (created_at DESC);
CREATE INDEX idx_security_events_event_type ON public.security_events (event_type, created_at DESC);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;
-- No policies — service-role client only, matching contact_submissions/instagram_posts.
