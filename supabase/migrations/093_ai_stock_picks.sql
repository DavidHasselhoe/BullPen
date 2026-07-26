-- Bull's Weekly Pick — one AI-generated stock pick per week, tracked forever.
--
-- Shared content (not per-user), one row per publication date, mirroring the
-- daily_briefs posture from migration 050: readable by any authenticated user,
-- written only by the service role via the weekly generation cron. Tier gating
-- on the Pro-only fields (thesis / risks) is enforced in the API route, not RLS.
--
-- HONESTY CONTRACT — the whole point of this feature is a track record nobody
-- can quietly edit, so the schema is deliberately append-only:
--   * There is no INSERT/UPDATE/DELETE policy at all. Only the service role writes.
--   * entry_price is stamped exactly once (the first regular-session open on or
--     after pick_date) and never updated afterwards — enforced by the trigger
--     below, not just convention.
--   * A pick is only ever 'closed' when the security stops trading (acquisition,
--     delisting). There is no application path that deletes a pick or removes it
--     from the aggregate performance calculation.

CREATE TABLE IF NOT EXISTS public.ai_stock_picks (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pick_date             DATE NOT NULL UNIQUE,     -- also the cron's idempotency key
  symbol                TEXT NOT NULL,
  company_name          TEXT,
  logo_url              TEXT,
  sector                TEXT,

  -- ── Immutable entry snapshot ────────────────────────────────────────────────
  -- NULL until the first regular session on/after pick_date has opened; stamped
  -- lazily by /api/picks/performance from daily candles it already fetches.
  entry_price           NUMERIC(18,6),
  benchmark_symbol      TEXT NOT NULL DEFAULT 'SPY',
  benchmark_entry_price NUMERIC(18,6),

  -- ── Free tier ───────────────────────────────────────────────────────────────
  headline              TEXT NOT NULL,
  one_liner             TEXT NOT NULL,
  catalyst_type         TEXT NOT NULL,
  conviction            SMALLINT NOT NULL,
  horizon               TEXT NOT NULL,

  -- ── Pro tier ────────────────────────────────────────────────────────────────
  thesis                JSONB NOT NULL,           -- structured blocks (see lib/ai/picks/schema.ts)
  risks                 JSONB NOT NULL,           -- what would invalidate the thesis
  metrics_snapshot      JSONB NOT NULL,           -- stats + health score + peer medians AT pick time

  model                 TEXT NOT NULL,
  generated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- ── Lifecycle ───────────────────────────────────────────────────────────────
  status                TEXT NOT NULL DEFAULT 'published',
  close_price           NUMERIC(18,6),
  close_date            DATE,
  close_reason          TEXT,

  CONSTRAINT ai_stock_picks_status_check
    CHECK (status IN ('published', 'closed')),
  CONSTRAINT ai_stock_picks_catalyst_check
    CHECK (catalyst_type IN ('undervalued', 'catalyst', 'growth', 'turnaround', 'thematic')),
  CONSTRAINT ai_stock_picks_horizon_check
    CHECK (horizon IN ('3m', '6m', '12m')),
  CONSTRAINT ai_stock_picks_conviction_check
    CHECK (conviction BETWEEN 1 AND 5),
  CONSTRAINT ai_stock_picks_entry_pair_check
    CHECK ((entry_price IS NULL) = (benchmark_entry_price IS NULL)),
  CONSTRAINT ai_stock_picks_closed_fields_check
    CHECK (status <> 'closed' OR (close_price IS NOT NULL AND close_date IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_ai_stock_picks_date
  ON public.ai_stock_picks (pick_date DESC);

-- Fast "which picks still need an entry price" lookup for the stamping pass.
CREATE INDEX IF NOT EXISTS idx_ai_stock_picks_unstamped
  ON public.ai_stock_picks (pick_date)
  WHERE entry_price IS NULL;

COMMENT ON TABLE  public.ai_stock_picks IS
  'Bull''s Weekly Pick — one AI stock pick per week with an immutable entry price. Append-only by design.';
COMMENT ON COLUMN public.ai_stock_picks.entry_price IS
  'Opening price of the first regular session on/after pick_date. Write-once (enforced by trigger).';
COMMENT ON COLUMN public.ai_stock_picks.metrics_snapshot IS
  'Grounding scorecard at pick time: screener_stats row, health score, and industry/sector peer medians.';

-- ── Write-once guard on the entry snapshot ───────────────────────────────────
-- Even the service role must not be able to restate an entry price after the
-- fact — that is exactly the edit that would let a track record be laundered.
-- Allows NULL -> value (the one legitimate stamping transition) and blocks
-- value -> anything else.
CREATE OR REPLACE FUNCTION public.ai_stock_picks_guard_entry()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF OLD.entry_price IS NOT NULL AND NEW.entry_price IS DISTINCT FROM OLD.entry_price THEN
    RAISE EXCEPTION 'ai_stock_picks.entry_price is write-once (pick_date %)', OLD.pick_date;
  END IF;
  IF OLD.benchmark_entry_price IS NOT NULL
     AND NEW.benchmark_entry_price IS DISTINCT FROM OLD.benchmark_entry_price THEN
    RAISE EXCEPTION 'ai_stock_picks.benchmark_entry_price is write-once (pick_date %)', OLD.pick_date;
  END IF;
  IF NEW.pick_date IS DISTINCT FROM OLD.pick_date OR NEW.symbol IS DISTINCT FROM OLD.symbol THEN
    RAISE EXCEPTION 'ai_stock_picks.pick_date/symbol are immutable';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_stock_picks_guard_entry ON public.ai_stock_picks;
CREATE TRIGGER trg_ai_stock_picks_guard_entry
  BEFORE UPDATE ON public.ai_stock_picks
  FOR EACH ROW EXECUTE FUNCTION public.ai_stock_picks_guard_entry();

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE public.ai_stock_picks ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read every pick. The route strips thesis/risks for
-- non-Pro users; everything else (including every losing pick) is public to
-- signed-in users by design.
DROP POLICY IF EXISTS "Authenticated users can read stock picks" ON public.ai_stock_picks;
CREATE POLICY "Authenticated users can read stock picks"
  ON public.ai_stock_picks FOR SELECT
  TO authenticated
  USING (true);

-- No INSERT / UPDATE / DELETE policy: writes are service-role only.
