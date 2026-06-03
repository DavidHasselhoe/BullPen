-- Trading currency for holdings.
-- The asset's native listing currency — the currency `avg_price` is denominated in.
-- This is stock-level metadata (USD for Micron, NOK for Kongsberg, EUR for ASML),
-- but it lives on user_holdings because the `companies` table requires an SEC CIK
-- (NOT NULL UNIQUE) and therefore cannot hold foreign-listed assets — exactly the
-- non-USD cases this column exists to label correctly.
--
-- NULL = unknown; the UI falls back to USD until the backfill resolver fills it in.

ALTER TABLE user_holdings
  ADD COLUMN IF NOT EXISTS trading_currency TEXT;

COMMENT ON COLUMN user_holdings.trading_currency IS
  'ISO 4217 currency the asset trades in (e.g. USD, NOK, EUR). The currency avg_price is denominated in. NULL = unknown (UI treats as USD).';
