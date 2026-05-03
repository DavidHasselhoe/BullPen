-- Add asset_type to user_holdings to distinguish stocks from crypto/commodity/forex/etf.
-- Defaults to 'stock' so existing rows are unaffected.

ALTER TABLE public.user_holdings
  ADD COLUMN IF NOT EXISTS asset_type TEXT DEFAULT 'stock';

COMMENT ON COLUMN public.user_holdings.asset_type IS
  'Asset class: stock, crypto, commodity, forex, etf';
