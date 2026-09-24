-- US economic calendar: scheduled macro releases (jobs report, CPI, Fed
-- decisions...) shown in the Market Calendar and used for morning-of
-- notifications. Filled by /api/cron/sync-economic-calendar from the
-- agencies' own published schedules (BLS + BEA calendar feeds, the Fed's
-- FOMC calendar, the Thursday jobless-claims rule). See
-- lib/market-data/economic-calendar.ts.

CREATE TABLE IF NOT EXISTS public.economic_events (
  -- '<kind>:<YYYY-MM-DD>': one release of a kind per day, so a re-sync upserts
  -- in place and a moved release date shows up as a new row (the old one is
  -- pruned by the sync).
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('jobs', 'cpi', 'ppi', 'jolts', 'claims', 'fomc', 'gdp', 'pce')),
  -- Calendar date in US Eastern time, the date the market experiences it on.
  date DATE NOT NULL,
  release_at TIMESTAMPTZ NOT NULL,
  -- Source wording for which period/edition this is, when the source gives
  -- one (BEA: "3rd Quarter 2026"; "Advance Estimate"). Null otherwise.
  detail TEXT NULL,
  -- FOMC meetings that also publish the Summary of Economic Projections.
  has_projections BOOLEAN NOT NULL DEFAULT false,
  source TEXT NOT NULL CHECK (source IN ('bls', 'bea', 'fed', 'rule')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_economic_events_date ON public.economic_events(date);

-- Public schedule data, readable by anyone. Writes go through the service
-- role only (the sync cron), which bypasses RLS.
ALTER TABLE public.economic_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS economic_events_public_read ON public.economic_events;
CREATE POLICY economic_events_public_read ON public.economic_events
  FOR SELECT TO anon, authenticated USING (true);
