-- 089_ai_generation_background_status.sql
-- Lets AI Deep Dive and Portfolio Builder generations run to completion on the
-- server even when the user navigates away or closes the tab.
--
-- Previously, generation was entirely tied to a single live SSE connection —
-- both API routes only wrote their result row after the client had streamed
-- the full response. If the client disconnected mid-generation, the work was
-- lost: nothing was ever persisted. Both routes now insert a `pending` row
-- immediately and update it to `done`/`error` from a background task (Next.js
-- `after()`) that keeps running regardless of the client connection, so the
-- client can poll (or come back later) to see the result, and a notification
-- fires on completion either way.

ALTER TABLE public.stock_deep_dives
  ALTER COLUMN report DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('pending', 'done', 'error')),
  ADD COLUMN IF NOT EXISTS phase TEXT,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

CREATE INDEX IF NOT EXISTS idx_stock_deep_dives_pending
  ON public.stock_deep_dives (user_id, symbol, status)
  WHERE status = 'pending';

ALTER TABLE public.portfolio_generations
  ALTER COLUMN portfolio DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('pending', 'done', 'error')),
  ADD COLUMN IF NOT EXISTS phase TEXT,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

CREATE INDEX IF NOT EXISTS idx_portfolio_generations_pending
  ON public.portfolio_generations (user_id, status)
  WHERE status = 'pending';

COMMENT ON COLUMN public.stock_deep_dives.status IS 'pending while generating in the background; done/error when finished. Existing rows default to done.';
COMMENT ON COLUMN public.stock_deep_dives.phase IS 'Coarse progress while pending: reading_data | searching | reasoning | composing.';
COMMENT ON COLUMN public.portfolio_generations.status IS 'pending while generating in the background; done/error when finished. Existing rows default to done.';
COMMENT ON COLUMN public.portfolio_generations.phase IS 'Coarse progress while pending: streaming | composing | validating.';
