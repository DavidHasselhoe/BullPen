-- Generic market data cache for expensive/semi-static API payloads.
-- Read-through pattern:
-- 1) API route checks this table by cache_key + expires_at
-- 2) On miss, call external API, then upsert payload here.

CREATE TABLE IF NOT EXISTS public.market_data_cache (
  cache_key TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  data_type TEXT NOT NULL,
  payload JSONB NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_market_data_cache_ticker
  ON public.market_data_cache (ticker);

CREATE INDEX IF NOT EXISTS idx_market_data_cache_data_type
  ON public.market_data_cache (data_type);

CREATE INDEX IF NOT EXISTS idx_market_data_cache_expires_at
  ON public.market_data_cache (expires_at);

COMMENT ON TABLE public.market_data_cache IS
  'TTL-based cache for market/company API payloads (profiles, financials, press releases, insider, statistics).';

ALTER TABLE public.market_data_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "market_data_cache_read" ON public.market_data_cache;
CREATE POLICY "market_data_cache_read"
  ON public.market_data_cache
  FOR SELECT
  USING (true);
