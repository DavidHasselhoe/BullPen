-- 150_congress_holdings.sql
-- Estimated open positions per member, for the allocation donut on the
-- member detail page. Companion to 149's congress_trades.
--
-- READ THIS BEFORE SURFACING ANY NUMBER FROM THIS TABLE
-- -----------------------------------------------------
-- These are ESTIMATES, not disclosed holdings, and they are not the same
-- class of number as institutional_holdings. A 13F states an exact share
-- count and an exact dollar value. A STOCK Act PTR states only a bracket
-- ($500,001 - $1,000,000), so the vendor reconstructs a position by taking
-- the MIDPOINT of each bracket and the trade-date price, then accumulating
-- buys and sells. Their own disclaimer, returned with every response and
-- stored on congress_politicians.holdings_disclaimer, says so.
--
-- That midpoint is precisely the synthesis migration 149 refuses to perform
-- on a single trade. It is kept here only because (a) it comes from the
-- vendor with an explicit disclaimer rather than being invented by us, and
-- (b) every surface that renders it is required to label it as estimated and
-- to show that disclaimer. A figure from this table must never be presented
-- in the same voice as a 13F value or a live quote.
--
-- Consequence for precision: render these compactly ($53.3M), never to the
-- cent. Printing $53,300,729.38 would claim an accuracy that a chain of
-- bracket midpoints cannot possibly support.

ALTER TABLE public.congress_politicians
  ADD COLUMN IF NOT EXISTS holdings_disclaimer TEXT,
  ADD COLUMN IF NOT EXISTS holdings_synced_at  TIMESTAMPTZ;

COMMENT ON COLUMN public.congress_politicians.holdings_disclaimer IS
  'Vendor disclaimer returned with the positions snapshot. Stored per member rather than hardcoded so the caveat shown to a reader is always the one that shipped with the data.';

CREATE TABLE IF NOT EXISTS public.congress_holdings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  politician_id     UUID NOT NULL REFERENCES public.congress_politicians(id) ON DELETE CASCADE,
  symbol            TEXT NOT NULL,
  company_name      TEXT,
  sector            TEXT,
  -- Every numeric below is reconstructed from bracket midpoints. See header.
  estimated_shares  NUMERIC(20,4),
  avg_cost_basis    NUMERIC(20,4),
  total_cost_basis  NUMERIC(20,2),
  current_price     NUMERIC(20,4),
  current_value     NUMERIC(20,2),
  unrealized_pnl    NUMERIC(20,2),
  unrealized_pnl_pct NUMERIC(12,4),
  total_buys        INTEGER,
  total_sells       INTEGER,
  first_buy_date    DATE,
  last_activity_date DATE,
  snapshot_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (politician_id, symbol)
);

CREATE INDEX IF NOT EXISTS idx_congress_holdings_politician
  ON public.congress_holdings (politician_id, current_value DESC);

ALTER TABLE public.congress_holdings ENABLE ROW LEVEL SECURITY;

-- Public, same reasoning as congress_trades in migration 149.
DROP POLICY IF EXISTS "Anyone can read congress holdings" ON public.congress_holdings;
CREATE POLICY "Anyone can read congress holdings"
  ON public.congress_holdings FOR SELECT
  USING (TRUE);

-- No INSERT/UPDATE/DELETE policy: writes are service-role only (cron).
