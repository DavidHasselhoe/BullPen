-- 095_fix_metric_stats_delete_where_clause.sql
-- Fixes a bug that has silently broken sector/industry benchmark refreshes
-- since they were introduced: both refresh_sector_metric_stats() and
-- refresh_industry_metric_stats() (migrations 087/088) open with an
-- unqualified `DELETE FROM <table>;`. Supabase's PostgREST-facing roles run
-- with a safe-update guard that rejects any DELETE/UPDATE without a WHERE
-- clause — even inside a SECURITY DEFINER function — so every call made via
-- supabase-js (`supabase.rpc(...)`, exactly how the prefetch cron calls these)
-- has failed with `DELETE requires a WHERE clause` (Postgres error 21000).
-- The failure was invisible: the app logs it via console.error and moves on
-- (by design — a stale benchmark was meant to be harmless), so the tables
-- silently stopped updating while everything else kept working. Confirmed via
-- a direct supabase-js RPC call reproducing the exact 400/21000 error; a
-- direct SQL connection (bypassing PostgREST) does not hit this guard, which
-- is why the functions appeared to "work" when tested manually.
--
-- Fix: add `WHERE true` — functionally identical (still deletes every row)
-- but satisfies the safe-update guard.

CREATE OR REPLACE FUNCTION public.refresh_sector_metric_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.sector_metric_stats WHERE true;

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
      SELECT sector, 'dividend_yield', dividend_yield FROM public.screener_stats
        WHERE sector IS NOT NULL AND dividend_yield IS NOT NULL AND dividend_yield > 0 AND dividend_yield < 1
    ) raw
    GROUP BY public.normalize_sector(sector), metric
  ) g
  WHERE g.sector IS NOT NULL AND g.n >= 5;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refresh_sector_metric_stats() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_sector_metric_stats() TO service_role;

CREATE OR REPLACE FUNCTION public.refresh_industry_metric_stats()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.industry_metric_stats WHERE true;

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
