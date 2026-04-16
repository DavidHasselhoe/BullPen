-- Add optional purchase date to user_holdings
-- Enables accurate P/L charting from the date a position was opened

ALTER TABLE public.user_holdings
  ADD COLUMN IF NOT EXISTS date_purchased DATE;

COMMENT ON COLUMN public.user_holdings.date_purchased IS
  'Optional date the position was opened; used as the chart start for portfolio P/L history';
