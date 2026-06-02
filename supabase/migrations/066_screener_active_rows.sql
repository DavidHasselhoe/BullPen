-- screener_active_rows() — the screener's default view, scoped to the actively
-- refreshed universe (screener_universe.tier = 1).
--
-- Without this, the default screener would load every row in screener_stats —
-- including the on-demand / discovery long tail (potentially thousands of names)
-- that lands there once referenced or swept. Scoping to tier 1 keeps the default
-- view focused on the curated ~S&P 1500 set while the long tail stays reachable
-- via holdings / watchlist / search (which query by ticker).

CREATE OR REPLACE FUNCTION public.screener_active_rows()
RETURNS SETOF public.screener_stats
LANGUAGE sql
STABLE
AS $$
  SELECT s.*
  FROM public.screener_stats s
  JOIN public.screener_universe u ON u.ticker = s.ticker AND u.tier = 1;
$$;
