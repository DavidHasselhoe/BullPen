-- Search Metrics Migration
-- Tracks search interactions for analytics and "Hot Picks" feature

-- =====================================================
-- SEARCH_METRICS TABLE
-- =====================================================
-- Tracks search interactions (clicks/selections) for analytics
-- Used to identify popular/hot stocks for discovery page
CREATE TABLE IF NOT EXISTS public.search_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker TEXT NOT NULL,
  clicked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Index for efficient queries
  CONSTRAINT search_metrics_ticker_not_empty CHECK (ticker <> '')
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_search_metrics_ticker ON public.search_metrics(ticker);
CREATE INDEX IF NOT EXISTS idx_search_metrics_clicked_at ON public.search_metrics(clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_metrics_user_id ON public.search_metrics(user_id);
CREATE INDEX IF NOT EXISTS idx_search_metrics_ticker_clicked ON public.search_metrics(ticker, clicked_at DESC);

-- Comments
COMMENT ON TABLE public.search_metrics IS 'Tracks search interactions (clicks/selections) for analytics and hot picks';
COMMENT ON COLUMN public.search_metrics.ticker IS 'Stock ticker that was clicked/selected';
COMMENT ON COLUMN public.search_metrics.clicked_at IS 'Timestamp when the search result was clicked';
COMMENT ON COLUMN public.search_metrics.user_id IS 'User who performed the search (NULL for anonymous users)';

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================
-- Enable RLS on search_metrics
ALTER TABLE public.search_metrics ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone can insert search metrics (tracking)
DROP POLICY IF EXISTS "Anyone can insert search metrics" ON public.search_metrics;
CREATE POLICY "Anyone can insert search metrics"
  ON public.search_metrics
  FOR INSERT
  WITH CHECK (true);

-- Policy: Anyone can read aggregated search metrics (for hot picks)
DROP POLICY IF EXISTS "Anyone can read search metrics" ON public.search_metrics;
CREATE POLICY "Anyone can read search metrics"
  ON public.search_metrics
  FOR SELECT
  USING (true);

-- =====================================================
-- FUNCTION: Get hot picks (most searched stocks)
-- =====================================================
-- Returns most searched stocks in a time period
CREATE OR REPLACE FUNCTION public.get_hot_picks(
  time_period_hours INTEGER DEFAULT 168, -- Default: 7 days
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
    sm.ticker,
    COUNT(*)::BIGINT as click_count,
    MAX(sm.clicked_at) as last_clicked_at
  FROM public.search_metrics sm
  WHERE sm.clicked_at >= NOW() - (time_period_hours || ' hours')::INTERVAL
  GROUP BY sm.ticker
  ORDER BY click_count DESC, last_clicked_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_hot_picks IS 'Returns most searched stocks in a time period for hot picks feature';
