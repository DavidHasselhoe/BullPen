-- 140_institutional_fund_metrics.sql
-- Sorting and filtering for the Discover fund list: portfolio size, how long a
-- fund has filed 13Fs, what it is most invested in, and how much it changed
-- since last quarter.

-- Earliest 13F-HR on SEC EDGAR. Electronic filing only goes back to ~1999, so
-- this is "filing since", not when the fund was founded. Filled by the weekly
-- sync for any fund where it is still null.
ALTER TABLE public.institutional_investors
  ADD COLUMN IF NOT EXISTS first_13f_filed_date DATE;

-- One row per active fund, computed from its newest and previous parsed
-- filings. Called with the service role by /api/institutions, which caches it.
--
-- Symbols are filled from cusip_ticker_map exactly the way the holdings route's
-- fetchAllHoldings() does, so a card's sector split cannot disagree with the
-- fund page it links to.
--
-- sector_weights is a percent of the filing's non-option value, keyed by
-- normalize_sector() names, plus 'ETFs & Funds' and 'Unclassified' so the
-- caller can see how much of the portfolio the split actually covers.
--
-- new/exited/previous follow compute-diff.ts: a position is (cusip, put_call),
-- options included. All three are null for a fund with only one filing, which
-- has nothing to compare against.
CREATE OR REPLACE FUNCTION public.institutional_fund_metrics()
RETURNS TABLE (
  investor_id UUID,
  total_value_usd NUMERIC,
  sector_weights JSONB,
  new_positions INTEGER,
  exited_positions INTEGER,
  previous_positions INTEGER
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  WITH ranked AS (
    SELECT f.id, f.investor_id, f.total_value_usd,
      row_number() OVER (PARTITION BY f.investor_id ORDER BY f.period_of_report DESC) AS rn
    FROM institutional_filings f
    JOIN institutional_investors i ON i.id = f.investor_id AND i.is_active
    WHERE f.parse_status = 'ok'
  ),
  cur AS (SELECT * FROM ranked WHERE rn = 1),
  prev AS (SELECT * FROM ranked WHERE rn = 2),
  classified AS (
    SELECT c.investor_id, h.value_usd,
      -- Scalar lookups rather than joins: a ticker can appear more than once
      -- in these reference tables, and a join would double-count its value.
      CASE
        WHEN (SELECT si.kind FROM search_index si WHERE si.ticker = s.symbol LIMIT 1) IN ('e', 'f')
          THEN 'ETFs & Funds'
        ELSE normalize_sector(COALESCE(
          (SELECT ts.sector FROM ticker_sectors ts WHERE ts.ticker = s.symbol),
          (SELECT NULLIF(ss.sector, '') FROM screener_stats ss WHERE ss.ticker = s.symbol LIMIT 1),
          (SELECT NULLIF(co.sector, '') FROM companies co WHERE co.ticker = s.symbol LIMIT 1)
        ))
      END AS sector
    FROM cur c
    JOIN institutional_holdings h ON h.filing_id = c.id
    CROSS JOIN LATERAL (
      SELECT COALESCE(
        h.symbol,
        (SELECT m.symbol FROM cusip_ticker_map m WHERE m.cusip = h.cusip AND m.symbol IS NOT NULL LIMIT 1)
      ) AS symbol
    ) s
    WHERE h.put_call IS NULL
  ),
  sector_totals AS (
    SELECT investor_id, COALESCE(sector, 'Unclassified') AS sector, SUM(value_usd) AS value_usd
    FROM classified
    GROUP BY 1, 2
  ),
  weights AS (
    SELECT investor_id,
      jsonb_object_agg(sector, round(100 * value_usd / NULLIF(total, 0), 2)) AS sector_weights
    FROM (
      SELECT st.*, SUM(st.value_usd) OVER (PARTITION BY st.investor_id) AS total
      FROM sector_totals st
    ) x
    GROUP BY investor_id
  ),
  cur_keys AS (
    SELECT c.investor_id, h.cusip || ':' || COALESCE(h.put_call, '') AS k
    FROM cur c JOIN institutional_holdings h ON h.filing_id = c.id
  ),
  prev_keys AS (
    SELECT p.investor_id, h.cusip || ':' || COALESCE(h.put_call, '') AS k
    FROM prev p JOIN institutional_holdings h ON h.filing_id = p.id
  ),
  diff AS (
    SELECT COALESCE(ck.investor_id, pk.investor_id) AS investor_id,
      COUNT(*) FILTER (WHERE pk.k IS NULL) AS new_positions,
      COUNT(*) FILTER (WHERE ck.k IS NULL) AS exited_positions,
      COUNT(pk.k) AS previous_positions
    FROM cur_keys ck
    FULL JOIN prev_keys pk ON pk.investor_id = ck.investor_id AND pk.k = ck.k
    GROUP BY 1
  )
  SELECT c.investor_id,
    c.total_value_usd,
    w.sector_weights,
    CASE WHEN p.id IS NULL THEN NULL ELSE d.new_positions::INTEGER END,
    CASE WHEN p.id IS NULL THEN NULL ELSE d.exited_positions::INTEGER END,
    CASE WHEN p.id IS NULL THEN NULL ELSE d.previous_positions::INTEGER END
  FROM cur c
  LEFT JOIN prev p ON p.investor_id = c.investor_id
  LEFT JOIN weights w ON w.investor_id = c.investor_id
  LEFT JOIN diff d ON d.investor_id = c.investor_id;
$$;

-- Tickers held in active funds' newest filings that no reference table has a
-- sector for, largest total value first. Feeds lib/institutions/
-- enrich-holding-sectors.ts. ETFs and funds are excluded: they have no sector
-- to look up and are bucketed as 'ETFs & Funds' above.
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
  ORDER BY held.value_usd DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 1000);
$$;

REVOKE ALL ON FUNCTION public.institutional_fund_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.institutional_fund_metrics() TO service_role;

REVOKE ALL ON FUNCTION public.institutional_symbols_missing_sector(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.institutional_symbols_missing_sector(INTEGER) TO service_role;
