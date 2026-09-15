-- 141_fund_metrics_share_positions_only.sql
-- Quarterly change in institutional_fund_metrics() counts share positions only.
--
-- 140 keyed positions on (cusip, put_call) with options included, mirroring
-- compute-diff.ts. But the fund card's position count (institutional_filings.
-- total_positions) is share rows only, so the two disagreed badly for funds
-- that trade options: Citadel's previous quarter read as 12,857 positions
-- (6,006 share rows + 6,851 option rows) next to a card saying 6,354. A
-- "changed since last quarter" figure has to share the denominator the reader
-- can see. Everything else is unchanged from 140.
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
    SELECT c.investor_id, h.cusip AS k
    FROM cur c JOIN institutional_holdings h ON h.filing_id = c.id
    WHERE h.put_call IS NULL
  ),
  prev_keys AS (
    SELECT p.investor_id, h.cusip AS k
    FROM prev p JOIN institutional_holdings h ON h.filing_id = p.id
    WHERE h.put_call IS NULL
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

REVOKE ALL ON FUNCTION public.institutional_fund_metrics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.institutional_fund_metrics() TO service_role;
