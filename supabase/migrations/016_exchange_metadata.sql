-- Exchange Metadata Migration
-- Stores exchange trading hours and holiday calendars

-- =====================================================
-- EXCHANGES TABLE
-- =====================================================
-- Stores static exchange configuration
CREATE TABLE IF NOT EXISTS public.exchanges (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  timezone TEXT NOT NULL,          -- IANA timezone (e.g. Europe/Oslo)
  open_time TIME NOT NULL,
  close_time TIME NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for country lookups
CREATE INDEX IF NOT EXISTS idx_exchanges_country ON public.exchanges(country);

-- Comments
COMMENT ON TABLE public.exchanges IS 'Exchange configuration with trading hours in local timezone';
COMMENT ON COLUMN public.exchanges.code IS 'Exchange code (e.g., OSE, NYSE, LSE)';
COMMENT ON COLUMN public.exchanges.timezone IS 'IANA timezone identifier (e.g., Europe/Oslo, America/New_York)';
COMMENT ON COLUMN public.exchanges.open_time IS 'Regular trading open time in exchange local timezone';
COMMENT ON COLUMN public.exchanges.close_time IS 'Regular trading close time in exchange local timezone';

-- =====================================================
-- EXCHANGE_HOLIDAYS TABLE
-- =====================================================
-- Stores year-specific closures and early closes
CREATE TABLE IF NOT EXISTS public.exchange_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_code TEXT NOT NULL REFERENCES public.exchanges(code) ON DELETE CASCADE,
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('closed', 'early_close')),
  early_close_time TIME NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (exchange_code, date)
);

-- Index for fast holiday lookups
CREATE INDEX IF NOT EXISTS idx_exchange_holidays_lookup ON public.exchange_holidays(exchange_code, date);
CREATE INDEX IF NOT EXISTS idx_exchange_holidays_date ON public.exchange_holidays(date);

-- Comments
COMMENT ON TABLE public.exchange_holidays IS 'Year-specific exchange closures and early closes';
COMMENT ON COLUMN public.exchange_holidays.type IS 'Type of holiday: closed (full day) or early_close (half day)';
COMMENT ON COLUMN public.exchange_holidays.early_close_time IS 'Early close time for half-days (in exchange local time)';
COMMENT ON COLUMN public.exchange_holidays.description IS 'Description of the holiday/closure reason';
