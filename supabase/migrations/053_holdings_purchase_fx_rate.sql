-- Add FX-rate tracking to holdings so P&L can be calculated in the user's home currency.
-- purchase_fx_rate: USD → user_currency rate on the day the position was opened
-- purchase_currency: the user's home currency at purchase time (in case they change it later)

ALTER TABLE user_holdings
  ADD COLUMN IF NOT EXISTS purchase_currency TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS purchase_fx_rate  NUMERIC(18, 8);

COMMENT ON COLUMN user_holdings.purchase_currency IS 'User home currency at purchase time (ISO 4217)';
COMMENT ON COLUMN user_holdings.purchase_fx_rate  IS '1 USD = X purchase_currency on date_purchased';
