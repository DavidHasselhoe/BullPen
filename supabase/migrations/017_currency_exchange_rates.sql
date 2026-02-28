-- Currency Exchange Rates Migration
-- Stores cached exchange rates from Frankfurter API (updates daily at 1600 CET)

-- =====================================================
-- CURRENCY_EXCHANGE_RATES TABLE
-- =====================================================
-- Caches exchange rates from Frankfurter API
-- Rates update daily at 1600 CET, so we cache them to avoid unnecessary API calls
CREATE TABLE IF NOT EXISTS public.currency_exchange_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL DEFAULT 'USD',
  target_currency TEXT NOT NULL,
  rate NUMERIC(20, 6) NOT NULL,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(base_currency, target_currency, date)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_currency_rates_lookup ON public.currency_exchange_rates(base_currency, target_currency, date DESC);
CREATE INDEX IF NOT EXISTS idx_currency_rates_date ON public.currency_exchange_rates(date DESC);

-- Comments
COMMENT ON TABLE public.currency_exchange_rates IS 'Cached exchange rates from Frankfurter API (updates daily at 1600 CET)';
COMMENT ON COLUMN public.currency_exchange_rates.base_currency IS 'Base currency code (USD)';
COMMENT ON COLUMN public.currency_exchange_rates.target_currency IS 'Target currency code (EUR, NOK, SEK, etc.)';
COMMENT ON COLUMN public.currency_exchange_rates.rate IS 'Exchange rate from base to target currency';
COMMENT ON COLUMN public.currency_exchange_rates.date IS 'Date of the exchange rate (rates update daily at 1600 CET)';

-- Function to get latest exchange rate
CREATE OR REPLACE FUNCTION public.get_exchange_rate(
  p_base_currency TEXT DEFAULT 'USD',
  p_target_currency TEXT DEFAULT 'USD'
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_rate NUMERIC;
BEGIN
  -- If same currency, return 1
  IF p_base_currency = p_target_currency THEN
    RETURN 1.0;
  END IF;
  
  -- Get latest rate from cache
  SELECT rate INTO v_rate
  FROM public.currency_exchange_rates
  WHERE base_currency = p_base_currency
    AND target_currency = p_target_currency
    AND date = (
      SELECT MAX(date)
      FROM public.currency_exchange_rates
      WHERE base_currency = p_base_currency
        AND target_currency = p_target_currency
    )
  LIMIT 1;
  
  -- If not found, return NULL (will trigger API fetch)
  RETURN v_rate;
END;
$$;

COMMENT ON FUNCTION public.get_exchange_rate IS 'Gets the latest cached exchange rate between two currencies';
