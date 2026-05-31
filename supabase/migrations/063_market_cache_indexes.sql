-- Composite indexes for market_data_cache to support the daily prefetch cron.
--
-- The cron queries combine (data_type + fetched_at) and (cache_key + expires_at)
-- in WHERE clauses. The existing single-column indexes help but the planner still
-- has to merge two separate index scans. These composite indexes give it a single
-- ordered scan per query pattern, cutting cron runtime as the cache table grows.

CREATE INDEX IF NOT EXISTS idx_market_cache_type_fetched
  ON public.market_data_cache (data_type, fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_market_cache_key_expires
  ON public.market_data_cache (cache_key, expires_at DESC);
