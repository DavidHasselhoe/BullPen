-- 101_feedback_reports.sql
-- User-submitted bug reports and feature requests, with an admin-managed
-- status lifecycle (pending -> in_progress -> resolved). `status` stays a
-- single generic enum rather than type-specific values ('fixed' for bugs,
-- 'implemented' for features) — the admin dashboard renders the
-- type-appropriate label for `resolved`, so the schema doesn't need a
-- cross-column CHECK to keep type/status in sync.

CREATE TABLE public.feedback_reports (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  type          TEXT NOT NULL CHECK (type IN ('bug', 'feature')),
  title         TEXT NOT NULL,
  description   TEXT NOT NULL,
  -- Path the user was on when they reported it — free debugging context for
  -- bugs, captured automatically rather than asked for.
  page_url      TEXT,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved')),
  admin_notes   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_feedback_reports_status ON public.feedback_reports (status, created_at DESC);
CREATE INDEX idx_feedback_reports_user ON public.feedback_reports (user_id, created_at DESC);

CREATE TRIGGER update_feedback_reports_updated_at BEFORE UPDATE ON public.feedback_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.feedback_reports ENABLE ROW LEVEL SECURITY;

-- Owners can submit and browse their own reports. The admin dashboard does
-- NOT go through these policies — it reads/writes via a service-role client
-- (app/api/admin/feedback/*), gated by isAdmin() server-side, same reasoning
-- as portfolio_shares: admins need to see every user's reports, which no
-- per-row owner policy can express without a broader (and riskier) policy.
CREATE POLICY "Users create their own feedback reports"
  ON public.feedback_reports FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view their own feedback reports"
  ON public.feedback_reports FOR SELECT
  USING (auth.uid() = user_id);
