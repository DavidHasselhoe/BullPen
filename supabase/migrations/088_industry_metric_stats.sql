-- 088_industry_metric_stats.sql
-- Industry-level companion to migration 087's sector_metric_stats.
--
-- Why: "sector" (Technology, Healthcare, ...) is too coarse a peer group for
-- metrics like beta — e.g. Microsoft (Software) and NVIDIA (Electronic
-- Components/semiconductors) share a sector but have meaningfully different
-- volatility profiles. TwelveData's /profile already reports a narrower
-- `industry` per company (screener_stats.industry, sourced by the prefetch
-- cron), so this rolls up the same percentiles one level down. The stock
-- page prefers the industry bucket and only falls back to sector when the
-- industry bucket is too thin (<5 samples) to be a reliable median — see
-- lib/finance/sector-benchmarks.ts.

CREATE TABLE IF NOT EXISTS industry_metric_stats (
  industry     TEXT NOT NULL,
  metric       TEXT NOT NULL,          -- same metric keys as sector_metric_stats
  p25          DOUBLE PRECISION,
  median       DOUBLE PRECISION,
  p75          DOUBLE PRECISION,
  sample_size  INTEGER NOT NULL DEFAULT 0,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (industry, metric)
);

-- Public reference data (no user data), same posture as sector_metric_stats.
ALTER TABLE industry_metric_stats ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'industry_metric_stats' AND policyname = 'industry_metric_stats_read'
  ) THEN
    CREATE POLICY "industry_metric_stats_read" ON industry_metric_stats
      FOR SELECT USING (true);
  END IF;
END $$;

-- Recompute every industry/metric bucket from the current screener_stats
-- snapshot. Called alongside refresh_sector_metric_stats() at the end of the
-- prefetch cron's stats sweep. Only publishes a bucket with at least 5
-- samples, so a thin industry never yields a noisy median — the TS lookup
-- falls back to the sector bucket in that case. Unlike sector, industry
-- labels come from one consistent taxonomy (TwelveData /profile) so no
-- normalize_industry() canonicalization step is needed.
CREATE OR REPLACE FUNCTION public.refresh_industry_metric_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.industry_metric_stats;

  INSERT INTO public.industry_metric_stats (industry, metric, p25, median, p75, sample_size, updated_at)
  SELECT g.industry, g.metric, g.p25, g.median, g.p75, g.n, now()
  FROM (
    SELECT
      btrim(industry) AS industry,
      metric,
      percentile_cont(0.25) WITHIN GROUP (ORDER BY val) AS p25,
      percentile_cont(0.50) WITHIN GROUP (ORDER BY val) AS median,
      percentile_cont(0.75) WITHIN GROUP (ORDER BY val) AS p75,
      count(*) AS n
    FROM (
      SELECT industry, 'pe_ratio'::text AS metric, pe_ratio::double precision AS val
        FROM public.screener_stats
        WHERE industry IS NOT NULL AND pe_ratio IS NOT NULL AND pe_ratio > 0 AND pe_ratio < 1000
      UNION ALL
      SELECT industry, 'forward_pe', forward_pe FROM public.screener_stats
        WHERE industry IS NOT NULL AND forward_pe IS NOT NULL AND forward_pe > 0 AND forward_pe < 1000
      UNION ALL
      SELECT industry, 'pb_ratio', pb_ratio FROM public.screener_stats
        WHERE industry IS NOT NULL AND pb_ratio IS NOT NULL AND pb_ratio > 0 AND pb_ratio < 1000
      UNION ALL
      SELECT industry, 'ps_ratio', ps_ratio FROM public.screener_stats
        WHERE industry IS NOT NULL AND ps_ratio IS NOT NULL AND ps_ratio > 0 AND ps_ratio < 1000
      UNION ALL
      SELECT industry, 'ev_to_ebitda', ev_to_ebitda FROM public.screener_stats
        WHERE industry IS NOT NULL AND ev_to_ebitda IS NOT NULL AND ev_to_ebitda > 0 AND ev_to_ebitda < 1000
      UNION ALL
      SELECT industry, 'profit_margin', profit_margin FROM public.screener_stats
        WHERE industry IS NOT NULL AND profit_margin IS NOT NULL AND profit_margin BETWEEN -5 AND 5
      UNION ALL
      SELECT industry, 'revenue_growth_yoy', revenue_growth_yoy FROM public.screener_stats
        WHERE industry IS NOT NULL AND revenue_growth_yoy IS NOT NULL AND revenue_growth_yoy BETWEEN -100 AND 1000
      UNION ALL
      SELECT industry, 'earnings_growth_yoy', earnings_growth_yoy FROM public.screener_stats
        WHERE industry IS NOT NULL AND earnings_growth_yoy IS NOT NULL AND earnings_growth_yoy BETWEEN -100 AND 1000
      UNION ALL
      SELECT industry, 'beta', beta FROM public.screener_stats
        WHERE industry IS NOT NULL AND beta IS NOT NULL AND beta > -10 AND beta < 10
      UNION ALL
      SELECT industry, 'dividend_yield', dividend_yield FROM public.screener_stats
        WHERE industry IS NOT NULL AND dividend_yield IS NOT NULL AND dividend_yield > 0 AND dividend_yield < 1
    ) raw
    GROUP BY btrim(industry), metric
  ) g
  WHERE g.industry IS NOT NULL AND g.industry <> '' AND g.n >= 5;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_industry_metric_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_industry_metric_stats() TO service_role;
