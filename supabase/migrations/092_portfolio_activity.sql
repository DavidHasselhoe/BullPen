-- 092_portfolio_activity.sql
-- Portfolio activity log: records deliberate buy-more/open/sell/close events
-- on manually-entered holdings, surfaced on the profile Activity tab. Mirrors
-- health_score_history's write-only-by-service-role pattern. No backfill —
-- starts accumulating from ship date forward (buys were never logged before
-- this, and existing holding_sales rows don't store quantity-before-sale
-- needed to compute a historical trim percentage).
-- See docs/superpowers/specs/2026-07-24-profile-activity-tab-design.md.

CREATE TABLE IF NOT EXISTS public.portfolio_activity (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol         TEXT NOT NULL,
  company_name   TEXT NOT NULL,
  action         TEXT NOT NULL CHECK (action IN ('opened', 'increased', 'trimmed', 'closed')),
  percent_change NUMERIC,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_portfolio_activity_user
  ON public.portfolio_activity (user_id, created_at DESC);

ALTER TABLE public.portfolio_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read portfolio activity"
  ON public.portfolio_activity FOR SELECT
  TO authenticated
  USING (true);

COMMENT ON TABLE public.portfolio_activity IS
  'Deliberate buy-more/open/sell/close events on manually-entered holdings, for the profile Activity tab. No client INSERT/UPDATE/DELETE — written only by holdings-db.ts via the service-role client.';
COMMENT ON COLUMN public.portfolio_activity.percent_change IS
  'Percent of the pre-event position added/removed. Only set for increased/trimmed; null for opened/closed (open is from zero, close is definitionally -100%).';
