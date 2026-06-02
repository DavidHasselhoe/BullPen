-- Screener Universe — DB-backed reference table for the screenable stock universe.
--
-- Replaces the hardcoded SP500_TICKERS array as the source of truth for which
-- tickers the screener refresh cron populates. A `tier` column drives the
-- refresh cadence:
--   tier 1 = actively refreshed (S&P 1500: large + mid + small cap)
--   tier 0 = on-demand only (the long tail; stats fetched lazily when referenced)
--
-- market_cap is stamped back by the refresh job so the set can later be
-- re-tiered by size (small caps that grow graduate into the active set).

CREATE TABLE IF NOT EXISTS public.screener_universe (
  ticker            TEXT PRIMARY KEY,
  name              TEXT,
  exchange          TEXT,
  type              TEXT,                       -- e.g. 'Common Stock', 'ADR'
  country           TEXT,
  tier              SMALLINT NOT NULL DEFAULT 0, -- 1 = actively refreshed, 0 = on-demand only
  market_cap        BIGINT,                      -- stamped by refresh; used for re-tiering
  source            TEXT,                        -- 'sp500' | 'sp400' | 'sp600' | 'nasdaq100' | 'twelvedata_stocks'
  added_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_refreshed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_screener_universe_tier ON public.screener_universe(tier);
CREATE INDEX IF NOT EXISTS idx_screener_universe_market_cap
  ON public.screener_universe(market_cap DESC NULLS LAST);

-- RLS: authenticated users can read; writes happen server-side via the service role.
ALTER TABLE public.screener_universe ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read screener universe" ON public.screener_universe;
CREATE POLICY "Authenticated users can read screener universe"
  ON public.screener_universe FOR SELECT
  TO authenticated
  USING (true);
