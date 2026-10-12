-- A stock can sit in more than one of a user's watchlists.
--
-- user_watchlist was unique on (user_id, symbol), so a stock lived in exactly
-- one list and adding it to another silently moved it. Users want the same
-- stock in, say, both "AI" and "Interesting", so the key becomes
-- (user_id, list_id, symbol): one row per stock per list.
--
-- Readers that care about the stock rather than the row (notification crons,
-- calendar, home, discover) already collapse by user + symbol. The one SQL
-- reader that counted rows is tracked_symbols_missing_sector (migration 143),
-- whose ordering is "how many people track it"; it now counts distinct users
-- so one person with a stock in three lists is not three trackers.

ALTER TABLE public.user_watchlist DROP CONSTRAINT user_watchlist_user_id_symbol_key;
ALTER TABLE public.user_watchlist
  ADD CONSTRAINT user_watchlist_user_id_list_id_symbol_key UNIQUE (user_id, list_id, symbol);

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
    SELECT upper(w.symbol) AS symbol, count(DISTINCT w.user_id) AS trackers
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

