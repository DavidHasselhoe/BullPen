-- Sector enrichment for the screener universe.
--
-- screener_stats.sector was null for 2,822 of 3,058 rows (2026-09-30): the
-- screener refresh read sectors only from the 39-row `companies` table and
-- wrote null over everything else each night. The refresh now reads
-- ticker_sectors first, and a backfill from ticker_sectors and cached /profile
-- payloads brought coverage to 1,387. What is left has no sector anywhere in
-- the database and needs a /profile lookup (10 credits each).
--
-- Same exclusions as tracked_symbols_missing_sector (migration 143), pointed at
-- screener_stats and ordered by market cap, so the companies people are most
-- likely to screen for get classified first.

CREATE OR REPLACE FUNCTION public.screener_symbols_missing_sector(p_limit integer DEFAULT 300)
RETURNS TABLE(symbol text, market_cap double precision)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT ss.ticker AS symbol, ss.market_cap::double precision
  FROM screener_stats ss
  WHERE NULLIF(ss.sector, '') IS NULL
    AND NOT EXISTS (SELECT 1 FROM ticker_sectors ts WHERE ts.ticker = ss.ticker)
    AND NOT EXISTS (SELECT 1 FROM companies co WHERE co.ticker = ss.ticker AND NULLIF(co.sector, '') IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM search_index si WHERE si.ticker = ss.ticker AND si.kind IN ('e', 'f'))
    AND NOT EXISTS (
      SELECT 1 FROM ticker_sector_misses tm
      WHERE tm.ticker = ss.ticker AND tm.last_attempt_at > now() - INTERVAL '30 days'
    )
  ORDER BY ss.market_cap DESC NULLS LAST, ss.ticker
  LIMIT LEAST(GREATEST(p_limit, 1), 1000);
$function$;

REVOKE ALL ON FUNCTION public.screener_symbols_missing_sector(integer) FROM PUBLIC, anon, authenticated;
