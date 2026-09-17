-- Sector enrichment for the symbols USERS track, not just the ones the tracked
-- funds hold.
--
-- institutional_symbols_missing_sector (migration 142) already fills sectors
-- for 13F holdings, credit-paced and miss-aware. Nothing did the same for a
-- symbol someone holds or watches, so those were classified only if a user
-- happened to open the holdings page and trigger the lazy /profile path. This
-- is the same query shape pointed at user_holdings and user_watchlist.
--
-- Same four exclusions as its sibling, and one more:
--   * already classified in ticker_sectors, screener_stats or companies
--   * an ETF or index fund (search_index.kind), which has no single sector
--   * attempted and missed within 30 days (ticker_sector_misses)
--   * NEW: crypto, which has no sector at all. Without this, BTC/USD and
--     friends would be looked up, missed, recorded, and retried every 30 days
--     forever at 10 credits a call.
--
-- Ordered by how many people track it, so a symbol on twenty watchlists is
-- classified before one on a single list.

CREATE OR REPLACE FUNCTION public.tracked_symbols_missing_sector(p_limit integer DEFAULT 300)
RETURNS TABLE(symbol text, trackers bigint)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  WITH tracked AS (
    SELECT upper(h.symbol) AS symbol, count(*) AS trackers
    FROM user_holdings h
    WHERE coalesce(h.quantity, 0) > 0
      AND coalesce(h.asset_type, '') <> 'crypto'
    GROUP BY upper(h.symbol)
    UNION ALL
    SELECT upper(w.symbol) AS symbol, count(*) AS trackers
    FROM user_watchlist w
    GROUP BY upper(w.symbol)
  ),
  totals AS (
    SELECT symbol, sum(trackers) AS trackers
    FROM tracked
    -- Crypto pairs carry a slash in this app's symbol convention (BTC/USD).
    -- The watchlist has no asset_type column, so the shape is the only signal.
    WHERE symbol NOT LIKE '%/%'
    GROUP BY symbol
  )
  SELECT totals.symbol, totals.trackers
  FROM totals
  WHERE NOT EXISTS (SELECT 1 FROM ticker_sectors ts WHERE ts.ticker = totals.symbol)
    AND NOT EXISTS (SELECT 1 FROM screener_stats ss WHERE ss.ticker = totals.symbol AND NULLIF(ss.sector, '') IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM companies co WHERE co.ticker = totals.symbol AND NULLIF(co.sector, '') IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM search_index si WHERE si.ticker = totals.symbol AND si.kind IN ('e', 'f'))
    AND NOT EXISTS (
      SELECT 1 FROM ticker_sector_misses tm
      WHERE tm.ticker = totals.symbol AND tm.last_attempt_at > now() - INTERVAL '30 days'
    )
  ORDER BY totals.trackers DESC, totals.symbol
  LIMIT LEAST(GREATEST(p_limit, 1), 1000);
$function$;
