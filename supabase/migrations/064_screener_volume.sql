-- Add 90-day average volume to screener_stats so the screener can compute
-- Relative Volume (RVOL = live day volume / avg_volume) client-side.
--
-- TwelveData /statistics already returns stock_statistics.avg_90_volume — it was
-- fetched in the refresh route but never persisted. This column captures it.
-- Existing rows backfill on the next daily refresh / manual "Refresh Data".

ALTER TABLE public.screener_stats
  ADD COLUMN IF NOT EXISTS avg_volume BIGINT;
