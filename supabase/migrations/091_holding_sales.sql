-- 091_holding_sales.sql
-- Records a sell event against a manually-entered holding, independent of
-- user_holdings' current (mutable) state. This is what lets
-- PortfolioPerformanceChart reconstruct "what did I actually hold, and when"
-- instead of projecting today's quantity backward across all of history.
-- See docs/superpowers/specs/2026-07-23-holding-sales-design.md.

CREATE TABLE IF NOT EXISTS public.holding_sales (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  original_holding_id  UUID REFERENCES public.user_holdings(id) ON DELETE SET NULL,
  symbol               TEXT NOT NULL,
  company_name         TEXT NOT NULL,
  quantity_sold        NUMERIC NOT NULL CHECK (quantity_sold > 0),
  avg_cost_basis       NUMERIC NOT NULL,
  sale_price           NUMERIC NOT NULL,
  realized_pl          NUMERIC NOT NULL,
  sale_date            DATE NOT NULL,
  trading_currency     TEXT,
  asset_type           TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holding_sales_user_symbol
  ON public.holding_sales (user_id, symbol);
CREATE INDEX IF NOT EXISTS idx_holding_sales_user_date
  ON public.holding_sales (user_id, sale_date DESC);

ALTER TABLE public.holding_sales ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own holding sales"
  ON public.holding_sales FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.holding_sales IS
  'Sell events against manually-entered holdings. Snapshots company_name/avg_cost_basis/trading_currency/asset_type so a sale record stays meaningful even if the originating user_holdings row is later hard-deleted.';
COMMENT ON COLUMN public.holding_sales.avg_cost_basis IS
  'user_holdings.avg_price at the moment of THIS sale — never re-read live, since avg_price keeps changing after future buys/sells.';
