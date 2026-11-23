-- Discover "Quality at a discount": skip names that only look cheap because
-- next year's earnings are forecast to more than triple.
--
-- A forward P/E under a third of a normal trailing P/E (0 < trailing < 50)
-- implies forward EPS above 3x trailing. On 2026-11-23 that put two broken
-- TwelveData estimates at the top of the list: TPL (3.66x forward vs 31.4x
-- trailing, an estimate not adjusted for its 2024 and 2025 3-for-1 splits;
-- Yahoo had ~42x) and COKE (~5.2x vs 23.6x; Seeking Alpha had 14-16x).
-- The check can't clean forward_pe everywhere: it also flags real gaps between
-- adjusted forecasts and GAAP trailing earnings (PFE, SHEL, APO, KR), so it
-- lives here, where "cheap only because of a forecast jump" isn't a clean
-- discount for a beginner either. Trailing P/E above 50 means depressed
-- trailing earnings, where a big forward drop is normal, so those stay in.
--
-- Same signature and return type as 094; health percentiles are still ranked
-- over the same rows (the new filter sits in `eligible`, not `ranked`).

CREATE OR REPLACE FUNCTION public.discover_quality_at_discount(
  min_market_cap bigint DEFAULT 2000000000,
  health_percentile double precision DEFAULT 0.75,
  limit_count integer DEFAULT 6
)
RETURNS TABLE(
  ticker text, name text, sector text, logo_url text, market_cap bigint,
  forward_pe real, health_score smallint, week52_high real, week52_low real,
  sector_median_fpe double precision
)
LANGUAGE sql
STABLE
SET search_path TO ''
AS $function$
  WITH ranked AS (
    SELECT
      s.ticker, s.name, s.sector, s.logo_url, s.market_cap,
      s.forward_pe, s.pe_ratio, s.health_score, s.week52_high, s.week52_low,
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
      r.health_pct + least(1.0, (m.median - r.forward_pe) / nullif(m.median, 0)) AS score
    FROM ranked r
    JOIN public.sector_metric_stats m
      ON m.sector = r.norm_sector
     AND m.metric = 'forward_pe'
    WHERE r.health_pct >= health_percentile
      AND r.forward_pe < m.median
      AND NOT (r.pe_ratio > 0 AND r.pe_ratio < 50 AND r.forward_pe < r.pe_ratio / 3)
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
$function$;
