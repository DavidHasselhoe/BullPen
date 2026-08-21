-- 113_asian_exchange_hours.sql
-- Adds support for exchanges with a midday trading halt (Tokyo, Shanghai
-- both close for lunch; Korea trades continuously). The existing schema
-- only supported one open_time -> close_time span per exchange, which
-- would make calculateMarketStatus() report "open" straight through a
-- lunch break for these markets. See lib/market/market-status.ts.

ALTER TABLE public.exchanges
  ADD COLUMN IF NOT EXISTS midday_close_time TIME NULL,
  ADD COLUMN IF NOT EXISTS midday_open_time TIME NULL;

COMMENT ON COLUMN public.exchanges.midday_close_time IS 'For exchanges with a lunch trading halt (e.g. Tokyo, Shanghai): local time the morning session ends. NULL for continuously-trading exchanges.';
COMMENT ON COLUMN public.exchanges.midday_open_time IS 'For exchanges with a lunch trading halt: local time the afternoon session resumes. NULL for continuously-trading exchanges.';
