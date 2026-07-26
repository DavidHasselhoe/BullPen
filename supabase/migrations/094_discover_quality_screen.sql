-- Discover: "Quality at a discount" screen.
--
-- Financially strong companies trading below what their sector typically
-- commands on forward earnings. Lives in SQL rather than the API route because
-- it needs a window function (percentile rank within sector), which PostgREST
-- can't express through the query builder.
--
-- WHY A PERCENTILE RATHER THAN AN ABSOLUTE HEALTH SCORE
-- The health-score distribution across the tracked universe is skewed low —
-- mean ~32, p90 ~51 — so an absolute cutoff of 70 clears barely thirty names
-- market-wide and collapses the list into whichever one or two sectors happen
-- to score generously. Ranking within a company's own sector both keeps the
-- pool usable and removes the structural bias that makes a utility's balance
-- sheet score differently from a biotech's.
--
-- ONE NAME PER SECTOR
-- The screen returns the strongest candidate from each sector before ranking
-- across sectors, so a six-name list is six different corners of the market
-- rather than six regional banks. That's the difference between a discovery
-- list and a filtered table.

CREATE OR REPLACE FUNCTION public.discover_quality_at_discount(
  min_market_cap    bigint           DEFAULT 2000000000,
  health_percentile double precision DEFAULT 0.75,
  limit_count       integer          DEFAULT 6
)
RETURNS TABLE (
  ticker             text,
  name               text,
  sector             text,
  logo_url           text,
  market_cap         bigint,
  forward_pe         real,
  health_score       smallint,
  week52_high        real,
  week52_low         real,
  sector_median_fpe  double precision
)
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH ranked AS (
    SELECT
      s.ticker, s.name, s.sector, s.logo_url, s.market_cap,
      s.forward_pe, s.health_score, s.week52_high, s.week52_low,
      public.normalize_sector(s.sector) AS norm_sector,
      percent_rank() OVER (
        PARTITION BY public.normalize_sector(s.sector)
        ORDER BY s.health_score
      ) AS health_pct
    FROM public.screener_stats s
    WHERE s.health_score IS NOT NULL
      AND s.sector IS NOT NULL
      AND s.forward_pe > 0
      AND s.forward_pe < 1000
      AND s.market_cap >= min_market_cap
  ),
  eligible AS (
    SELECT
      r.*,
      m.median AS sector_median_fpe,
      -- Composite: rewards both sides of the thesis. `health_pct` is already
      -- 0..1; the discount term is how far below the sector median it trades,
      -- clamped so one absurdly cheap outlier can't dominate the ranking.
      r.health_pct + least(1.0, (m.median - r.forward_pe) / nullif(m.median, 0)) AS score
    FROM ranked r
    JOIN public.sector_metric_stats m
      ON m.sector = r.norm_sector
     AND m.metric = 'forward_pe'
    WHERE r.health_pct >= health_percentile
      AND r.forward_pe < m.median
  ),
  best_per_sector AS (
    SELECT DISTINCT ON (e.norm_sector) e.*
    FROM eligible e
    ORDER BY e.norm_sector, e.score DESC
  )
  SELECT
    b.ticker, b.name, b.sector, b.logo_url, b.market_cap,
    b.forward_pe, b.health_score, b.week52_high, b.week52_low,
    b.sector_median_fpe
  FROM best_per_sector b
  ORDER BY b.score DESC
  LIMIT limit_count;
$$;

COMMENT ON FUNCTION public.discover_quality_at_discount IS
  'Discover page: financially strong companies (top health percentile within their own sector) trading below their sector median forward P/E. One name per sector.';

-- Read-only aggregation over two already-public reference tables
-- (screener_stats and sector_metric_stats both allow SELECT to all).
GRANT EXECUTE ON FUNCTION public.discover_quality_at_discount TO authenticated, service_role;
