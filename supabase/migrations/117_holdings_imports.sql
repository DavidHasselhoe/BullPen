-- 117_holdings_imports.sql
-- Draft + journal storage for the AI-powered transaction importer
-- (lib/import/). A parsed file is staged here for the review-grid UI, then
-- committed via a chronological replay into holding_purchases/holding_sales.
-- The journal exists because that replay is NOT wrapped in a single DB
-- transaction (Supabase JS has no multi-statement transaction, and
-- reimplementing the weighted-average-cost logic in a PL/pgSQL RPC would
-- create a second source of truth) — a mid-way failure must be reversible,
-- and the journal is what "Undo import" walks backwards.

CREATE TABLE IF NOT EXISTS public.holdings_imports (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status             TEXT NOT NULL DEFAULT 'draft'
                       CHECK (status IN ('draft', 'committing', 'done', 'failed', 'undone')),
  file_name          TEXT,
  format_label       TEXT,
  content_hash       TEXT,
  total_rows         INTEGER,
  transaction_count  INTEGER,
  applied_count      INTEGER NOT NULL DEFAULT 0,
  parsed             JSONB,
  error_message      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  committed_at       TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_holdings_imports_user_created
  ON public.holdings_imports (user_id, created_at DESC);

ALTER TABLE public.holdings_imports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own holdings imports"
  ON public.holdings_imports FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TABLE IF NOT EXISTS public.holdings_import_events (
  id             BIGSERIAL PRIMARY KEY,
  import_id      UUID NOT NULL REFERENCES public.holdings_imports(id) ON DELETE CASCADE,
  seq            INTEGER NOT NULL,
  source_line    INTEGER NOT NULL,
  action         TEXT NOT NULL CHECK (action IN ('buy', 'sell')),
  symbol         TEXT NOT NULL,
  entity_table   TEXT CHECK (entity_table IN ('holding_purchases', 'holding_sales')),
  entity_id      UUID,
  holding_id     UUID,
  quantity_delta NUMERIC,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_holdings_import_events_import
  ON public.holdings_import_events (import_id, seq);

ALTER TABLE public.holdings_import_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own holdings import events"
  ON public.holdings_import_events FOR ALL
  USING (import_id IN (SELECT id FROM public.holdings_imports WHERE user_id = auth.uid()))
  WITH CHECK (import_id IN (SELECT id FROM public.holdings_imports WHERE user_id = auth.uid()));

COMMENT ON TABLE public.holdings_imports IS
  'One row per uploaded transaction file. parsed holds the full ParsedImport + per-security resolutions + user edits as JSON while status=draft; status transitions to committing/done/failed/undone during and after the replay in lib/import/execute-replay.ts.';
COMMENT ON TABLE public.holdings_import_events IS
  'Append-only journal of every DB write a commit made, in order (seq). Undo walks this backwards: delete the entity row, reverse quantity_delta, recompute avg_price from surviving lots.';
