-- 087_sector_metric_stats.sql
-- Sector benchmark rollup: per-sector distribution (p25 / median / p75) for the
-- key beginner-facing metrics, computed purely from screener_stats (migration
-- 039), which the daily prefetch cron already populates for ~530 S&P 500 +
-- NASDAQ 100 stocks. No new TwelveData calls — this is a pure aggregation.
--
-- The stock page reads a company's sector benchmark to show "typical for its
-- sector" context on the Key Numbers meters (e.g. is this P/E cheap or dear
-- FOR ITS KIND, not just on an absolute 0–60 scale).

CREATE TABLE IF NOT EXISTS sector_metric_stats (
  sector       TEXT NOT NULL,
  metric       TEXT NOT NULL,          -- pe_ratio | forward_pe | pb_ratio | ps_ratio | ev_to_ebitda | profit_margin | revenue_growth_yoy | earnings_growth_yoy | beta | dividend_yield
  p25          DOUBLE PRECISION,
  median       DOUBLE PRECISION,
  p75          DOUBLE PRECISION,
  sample_size  INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (sector, metric)
);

-- Public reference data (no user data). Readable by all; only the service-role
-- backend writes it — matches the screener_stats_read posture from migration 039.
ALTER TABLE sector_metric_stats ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sector_metric_stats' AND policyname = 'sector_metric_stats_read'
  ) THEN
    CREATE POLICY "sector_metric_stats_read" ON sector_metric_stats
      FOR SELECT USING (true);
  END IF;
END $$;

-- Sector labels arrive from two taxonomies (GICS + TwelveData/Yahoo), so the
-- same economic sector shows up under different names ("Information Technology"
-- vs "Technology", "Health Care" vs "Healthcare"). Canonicalize to the
-- TwelveData taxonomy the stock-page profile uses, so buckets merge and the
-- page→benchmark lookup lines up. The TS side mirrors this in
-- lib/finance/sector-benchmarks.ts (keep the two in sync).
CREATE OR REPLACE FUNCTION public.normalize_sector(s text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN s IS NULL OR btrim(s) = '' THEN NULL
    WHEN lower(btrim(s)) IN ('information technology', 'tech') THEN 'Technology'
    WHEN lower(btrim(s)) = 'health care' THEN 'Healthcare'
    WHEN lower(btrim(s)) = 'financials' THEN 'Financial Services'
    WHEN lower(btrim(s)) = 'consumer discretionary' THEN 'Consumer Cyclical'
    WHEN lower(btrim(s)) = 'consumer staples' THEN 'Consumer Defensive'
    WHEN lower(btrim(s)) = 'materials' THEN 'Basic Materials'
    ELSE btrim(s)
  END;
$$;

-- Recompute every sector/metric bucket from the current screener_stats snapshot.
-- Called at the end of the prefetch cron's stats sweep. Only publishes a bucket
-- with at least 5 samples, so a thin sector never yields a noisy median.
-- Units mirror screener_stats: pe/pb/ps/ev/beta are raw ratios, profit_margin
-- and dividend_yield are fractions (0.24 = 24%), *_growth_yoy are percent (×100).
CREATE OR REPLACE FUNCTION public.refresh_sector_metric_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.sector_metric_stats;

  INSERT INTO public.sector_metric_stats (sector, metric, p25, median, p75, sample_size, updated_at)
  SELECT g.sector, g.metric, g.p25, g.median, g.p75, g.n, now()
  FROM (
    SELECT
      public.normalize_sector(sector) AS sector,
      metric,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY val) AS p25,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY val) AS median,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY val) AS p75,
      count(*) AS n
    FROM (
      SELECT sector, 'pe_ratio'::text AS metric, pe_ratio::double precision AS val
        FROM public.screener_stats
        WHERE sector IS NOT NULL AND pe_ratio IS NOT NULL AND pe_ratio > 0 AND pe_ratio < 1000
      UNION ALL
      SELECT sector, 'forward_pe', forward_pe FROM public.screener_stats
        WHERE sector IS NOT NULL AND forward_pe IS NOT NULL AND forward_pe > 0 AND forward_pe < 1000
      UNION ALL
      SELECT sector, 'pb_ratio', pb_ratio FROM public.screener_stats
        WHERE sector IS NOT NULL AND pb_ratio IS NOT NULL AND pb_ratio > 0 AND pb_ratio < 1000
      UNION ALL
      SELECT sector, 'ps_ratio', ps_ratio FROM public.screener_stats
        WHERE sector IS NOT NULL AND ps_ratio IS NOT NULL AND ps_ratio > 0 AND ps_ratio < 1000
      UNION ALL
      SELECT sector, 'ev_to_ebitda', ev_to_ebitda FROM public.screener_stats
        WHERE sector IS NOT NULL AND ev_to_ebitda IS NOT NULL AND ev_to_ebitda > 0 AND ev_to_ebitda < 1000
      UNION ALL
      SELECT sector, 'profit_margin', profit_margin FROM public.screener_stats
        WHERE sector IS NOT NULL AND profit_margin IS NOT NULL AND profit_margin BETWEEN -5 AND 5
      UNION ALL
      SELECT sector, 'revenue_growth_yoy', revenue_growth_yoy FROM public.screener_stats
        WHERE sector IS NOT NULL AND revenue_growth_yoy IS NOT NULL AND revenue_growth_yoy BETWEEN -100 AND 1000
      UNION ALL
      SELECT sector, 'earnings_growth_yoy', earnings_growth_yoy FROM public.screener_stats
        WHERE sector IS NOT NULL AND earnings_growth_yoy IS NOT NULL AND earnings_growth_yoy BETWEEN -100 AND 1000
      UNION ALL
      SELECT sector, 'beta', beta FROM public.screener_stats
        WHERE sector IS NOT NULL AND beta IS NOT NULL AND beta > -10 AND beta < 10
      UNION ALL
      -- Dividend yield: only among payers (> 0), so "typical" means typical for a
      -- dividend-paying peer, not dragged to ~0 by all the non-payers.
      SELECT sector, 'dividend_yield', dividend_yield FROM public.screener_stats
        WHERE sector IS NOT NULL AND dividend_yield IS NOT NULL AND dividend_yield > 0 AND dividend_yield < 1
    ) raw
    GROUP BY public.normalize_sector(sector), metric
  ) g
  WHERE g.sector IS NOT NULL AND g.n >= 5;
END;
$$;

-- The rollup is a service-role/cron job, not a public API. Keep it out of the
-- anon/authenticated PostgREST surface so no signed-out or signed-in client can
-- trigger a full recompute via /rest/v1/rpc.
REVOKE EXECUTE ON FUNCTION public.refresh_sector_metric_stats() FROM PUBLIC, anon, authenticated;
-- The prefetch cron calls this via the service-role client — grant it back explicitly.
GRANT EXECUTE ON FUNCTION public.refresh_sector_metric_stats() TO service_role;
