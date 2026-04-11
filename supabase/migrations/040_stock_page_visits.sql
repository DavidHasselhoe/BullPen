-- Stock detail page visits for Hot Picks (replaces search_metrics for popularity ranking)

CREATE TABLE IF NOT EXISTS public.stock_page_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  visited_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  CONSTRAINT stock_page_visits_ticker_not_empty CHECK (ticker <> '')
);

CREATE INDEX IF NOT EXISTS idx_stock_page_visits_ticker ON public.stock_page_visits(ticker);
CREATE INDEX IF NOT EXISTS idx_stock_page_visits_visited_at ON public.stock_page_visits(visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_page_visits_user_id ON public.stock_page_visits(user_id);
CREATE INDEX IF NOT EXISTS idx_stock_page_visits_ticker_visited ON public.stock_page_visits(ticker, visited_at DESC);

COMMENT ON TABLE public.stock_page_visits IS 'One row per stock detail page view; powers Hot Picks by visit count';

ALTER TABLE public.stock_page_visits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can insert stock page visits" ON public.stock_page_visits;
CREATE POLICY "Anyone can insert stock page visits"
  ON public.stock_page_visits
  FOR INSERT
  WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can read stock page visits" ON public.stock_page_visits;
CREATE POLICY "Anyone can read stock page visits"
  ON public.stock_page_visits
  FOR SELECT
  USING (true);

-- Hot Picks: most visited tickers in the window (column names unchanged for API compatibility)
CREATE OR REPLACE FUNCTION public.get_hot_picks(
  time_period_hours INTEGER DEFAULT 168,
  limit_count INTEGER DEFAULT 10
)
RETURNS TABLE (
  ticker TEXT,
  click_count BIGINT,
  last_clicked_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    v.ticker,
    COUNT(*)::BIGINT AS click_count,
    MAX(v.visited_at) AS last_clicked_at
  FROM public.stock_page_visits v
  WHERE v.visited_at >= NOW() - (time_period_hours || ' hours')::INTERVAL
  GROUP BY v.ticker
  ORDER BY click_count DESC, last_clicked_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_hot_picks IS 'Returns most visited stocks (detail page views) for Hot Picks';
