-- Economic release results: what CPI, the jobs report, the Fed... actually
-- printed, next to the schedule that 152 already stores. Filled by
-- /api/cron/check-economic-results (lib/market-data/economic-results.ts) from
-- FRED and the Fed's own statement. All US government data, public domain.

-- Raw series values, for the history charts and for computing results.
-- Daily target-range series are stored as change points only (one row per
-- change), so the table stays a few thousand rows.
CREATE TABLE IF NOT EXISTS public.economic_observations (
  series_id TEXT NOT NULL,          -- FRED id, e.g. 'CPIAUCNS'
  period DATE NOT NULL,             -- month/quarter start, week ending, or day
  value NUMERIC NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (series_id, period)
);

ALTER TABLE public.economic_observations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS economic_observations_public_read ON public.economic_observations;
CREATE POLICY economic_observations_public_read ON public.economic_observations
  FOR SELECT TO anon, authenticated USING (true);

-- The result as published on the day, frozen: a later revision changes the
-- charts (economic_observations) but not what a release said at the time.
ALTER TABLE public.economic_events
  ADD COLUMN IF NOT EXISTS period_label TEXT NULL,      -- 'September 2026', 'Q3 2026', 'Week ending Oct 24'
  ADD COLUMN IF NOT EXISTS results JSONB NULL,          -- [{ key, actual, previous }]
  ADD COLUMN IF NOT EXISTS results_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS verdict TEXT NULL CHECK (verdict IN ('hold', 'raise', 'lower'));
