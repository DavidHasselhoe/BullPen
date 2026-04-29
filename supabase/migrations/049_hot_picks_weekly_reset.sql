-- Hot Picks: reset to Monday 00:00 UTC each week instead of rolling window
-- date_trunc('week', ...) in PostgreSQL always anchors to ISO Monday.

CREATE OR REPLACE FUNCTION public.get_hot_picks(
  time_period_hours INTEGER DEFAULT 168,
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  ticker TEXT,
  click_count BIGINT,
  last_clicked_at TIMESTAMPTZ
) AS $$
DECLARE
  week_start TIMESTAMPTZ;
BEGIN
  -- Start of the current ISO week: Monday 00:00 UTC
  week_start := date_trunc('week', NOW() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';

  RETURN QUERY
  SELECT
    v.ticker,
    COUNT(*)::BIGINT AS click_count,
    MAX(v.visited_at) AS last_clicked_at
  FROM public.stock_page_visits v
  WHERE v.visited_at >= week_start
  GROUP BY v.ticker
  ORDER BY click_count DESC, last_clicked_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_hot_picks IS 'Returns most visited stocks since the start of the current ISO week (Monday 00:00 UTC). Resets automatically each Monday.';
