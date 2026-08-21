-- 111_holding_purchases.sql
-- Records one purchase lot per discrete buy event (initial purchase or
-- top-up) against a manually-entered holding. user_holdings collapses every
-- buy into a single blended avg_price/date_purchased; this table keeps the
-- individual events so chart markers can plot one accurate dot per lot
-- instead of one misleading averaged dot.
-- See docs/superpowers/specs/2026-08-21-holding-purchase-lots-design.md.

CREATE TABLE IF NOT EXISTS public.holding_purchases (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  holding_id        UUID NOT NULL REFERENCES public.user_holdings(id) ON DELETE CASCADE,
  symbol            TEXT NOT NULL,
  company_name      TEXT NOT NULL,
  quantity          NUMERIC NOT NULL CHECK (quantity > 0),
  price             NUMERIC NOT NULL,
  purchase_date     DATE NOT NULL,
  purchase_currency TEXT,
  purchase_fx_rate  NUMERIC,
  trading_currency  TEXT,
  asset_type        TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holding_purchases_holding
  ON public.holding_purchases (holding_id, purchase_date);
CREATE INDEX IF NOT EXISTS idx_holding_purchases_user
  ON public.holding_purchases (user_id, symbol);

ALTER TABLE public.holding_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own holding purchases"
  ON public.holding_purchases FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

COMMENT ON TABLE public.holding_purchases IS
  'One row per discrete purchase lot (initial buy or top-up) against a manually-entered holding. holding_id is ON DELETE CASCADE (unlike holding_sales'' SET NULL) — lots have no standalone display like the closed-positions list, they only feed chart markers on their still-existing parent holding.';
COMMENT ON COLUMN public.holding_purchases.price IS
  'This lot''s price per share, in trading_currency — never the blended user_holdings.avg_price, which keeps changing after future buys.';
