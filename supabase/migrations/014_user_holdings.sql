-- User Holdings Migration
-- Creates user_holdings table for tracking user stock portfolios
-- Supports tracking holdings with optional quantity and average buy price

-- =====================================================
-- USER_HOLDINGS TABLE
-- =====================================================
-- Stores user stock holdings
-- Allows null quantity and avg_price for tracking without portfolio values
CREATE TABLE IF NOT EXISTS public.user_holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol TEXT NOT NULL,
  company_name TEXT NOT NULL,
  quantity NUMERIC,
  avg_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicate holdings (same user, same symbol)
  UNIQUE(user_id, symbol)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_holdings_user_id ON public.user_holdings(user_id);
CREATE INDEX IF NOT EXISTS idx_user_holdings_symbol ON public.user_holdings(symbol);
CREATE INDEX IF NOT EXISTS idx_user_holdings_user_symbol ON public.user_holdings(user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_user_holdings_created_at ON public.user_holdings(created_at DESC);

-- Comments for documentation
COMMENT ON TABLE public.user_holdings IS 'User stock holdings with optional quantity and average buy price';
COMMENT ON COLUMN public.user_holdings.user_id IS 'References auth.users.id - owner of the holding';
COMMENT ON COLUMN public.user_holdings.symbol IS 'Stock ticker symbol (e.g., AAPL)';
COMMENT ON COLUMN public.user_holdings.company_name IS 'Company name for display purposes';
COMMENT ON COLUMN public.user_holdings.quantity IS 'Number of shares owned (nullable - allows tracking without portfolio values)';
COMMENT ON COLUMN public.user_holdings.avg_price IS 'Average buy price per share (nullable)';

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================
-- Enable RLS on user_holdings
ALTER TABLE public.user_holdings ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users can read their own holdings
DROP POLICY IF EXISTS "Users can read own holdings" ON public.user_holdings;
CREATE POLICY "Users can read own holdings"
  ON public.user_holdings
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy 2: Users can insert their own holdings
DROP POLICY IF EXISTS "Users can insert own holdings" ON public.user_holdings;
CREATE POLICY "Users can insert own holdings"
  ON public.user_holdings
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Policy 3: Users can update their own holdings
DROP POLICY IF EXISTS "Users can update own holdings" ON public.user_holdings;
CREATE POLICY "Users can update own holdings"
  ON public.user_holdings
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Policy 4: Users can delete their own holdings
DROP POLICY IF EXISTS "Users can delete own holdings" ON public.user_holdings;
CREATE POLICY "Users can delete own holdings"
  ON public.user_holdings
  FOR DELETE
  USING (auth.uid() = user_id);

-- =====================================================
-- TRIGGERS
-- =====================================================
-- Auto-update updated_at timestamp
DROP TRIGGER IF EXISTS update_user_holdings_updated_at ON public.user_holdings;
CREATE TRIGGER update_user_holdings_updated_at
  BEFORE UPDATE ON public.user_holdings
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
