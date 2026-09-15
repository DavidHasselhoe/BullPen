-- 142_share_class_symbols_and_sector_misses.sql
--
-- 1. Share-class tickers resolved through the ISIN-search fallback were stored
--    hyphenated (BRK-B, BF-A, MOG-A) while search_index, screener_stats,
--    ticker_sectors and TwelveData all use the dot form. "BRK-B" matched none
--    of them, so Berkshire's $611M position had no sector (and the sector
--    backfill re-asked TwelveData about it every round). The resolver now
--    normalizes at write time (lib/institutions/symbol-format.ts); this fixes
--    the rows already stored. Verified before writing: exactly 3 such symbols,
--    17 holdings rows, and all 3 dot forms exist in search_index.
UPDATE public.cusip_ticker_map
  SET symbol = regexp_replace(symbol, '^([A-Z]+)-([A-Z])$', '\1.\2')
  WHERE symbol ~ '^[A-Z]+-[A-Z]$';

UPDATE public.institutional_holdings
  SET symbol = regexp_replace(symbol, '^([A-Z]+)-([A-Z])$', '\1.\2')
  WHERE symbol ~ '^[A-Z]+-[A-Z]$';

-- 2. Tickers TwelveData has no sector for, or whose lookup failed. Without this
--    they stay "missing" forever and, being the highest-value misses, fill every
--    batch: the backfill fell from 22 of 25 resolved to 9 of 25 in 16 rounds, and
--    the weekly sync's 60 lookups would eventually go only to them.
CREATE TABLE IF NOT EXISTS public.ticker_sector_misses (
  ticker TEXT PRIMARY KEY,
  reason TEXT NOT NULL CHECK (reason IN ('no_sector', 'lookup_failed')),
  last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Server-only bookkeeping: RLS on with no policies, so anon/authenticated see nothing.
ALTER TABLE public.ticker_sector_misses ENABLE ROW LEVEL SECURITY;

-- 3. Skip a ticker missed in the last 30 days. After that it is asked again,
--    since a new listing or a data fix upstream can give it a sector later.
CREATE OR REPLACE FUNCTION public.institutional_symbols_missing_sector(p_limit INTEGER DEFAULT 300)
RETURNS TABLE (symbol TEXT, value_usd NUMERIC)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH cur AS (
    SELECT DISTINCT ON (f.investor_id) f.id
    FROM institutional_filings f
    JOIN institutional_investors i ON i.id = f.investor_id AND i.is_active
    WHERE f.parse_status = 'ok'
    ORDER BY f.investor_id, f.period_of_report DESC
  ),
  held AS (
    SELECT s.symbol, SUM(h.value_usd) AS value_usd
    FROM cur c
    JOIN institutional_holdings h ON h.filing_id = c.id
    CROSS JOIN LATERAL (
      SELECT COALESCE(
        h.symbol,
        (SELECT m.symbol FROM cusip_ticker_map m WHERE m.cusip = h.cusip AND m.symbol IS NOT NULL LIMIT 1)
      ) AS symbol
    ) s
    WHERE h.put_call IS NULL AND s.symbol IS NOT NULL
    GROUP BY s.symbol
  )
  SELECT held.symbol, held.value_usd
  FROM held
  WHERE NOT EXISTS (SELECT 1 FROM ticker_sectors ts WHERE ts.ticker = held.symbol)
    AND NOT EXISTS (SELECT 1 FROM screener_stats ss WHERE ss.ticker = held.symbol AND NULLIF(ss.sector, '') IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM companies co WHERE co.ticker = held.symbol AND NULLIF(co.sector, '') IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM search_index si WHERE si.ticker = held.symbol AND si.kind IN ('e', 'f'))
    AND NOT EXISTS (
      SELECT 1 FROM ticker_sector_misses tm
      WHERE tm.ticker = held.symbol AND tm.last_attempt_at > now() - INTERVAL '30 days'
    )
  ORDER BY held.value_usd DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 1000);
$$;

REVOKE ALL ON FUNCTION public.institutional_symbols_missing_sector(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.institutional_symbols_missing_sector(INTEGER) TO service_role;
