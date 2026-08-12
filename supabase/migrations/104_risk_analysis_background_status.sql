-- 104_risk_analysis_background_status.sql
-- Lets Portfolio Risk Analysis run to completion on the server even when the
-- user navigates away or closes the tab — the same fix 089 applied to AI Deep
-- Dive and Portfolio Builder.
--
-- Previously, the analysis was entirely tied to a single live request: the
-- route only wrote a risk_analyses row after Claude's response had come back
-- to that request. If the client disconnected mid-call, the AI cost was still
-- incurred but nothing was ever persisted. The route now inserts a `pending`
-- row immediately and updates it to `done`/`error` from a background task
-- (Next.js `after()`) that keeps running regardless of the client connection,
-- so the client can poll (or come back later) to see the result, and a
-- notification fires on completion either way.

ALTER TABLE public.risk_analyses
  ALTER COLUMN analysis DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'done' CHECK (status IN ('pending', 'done', 'error')),
  ADD COLUMN IF NOT EXISTS phase TEXT,
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS error_message TEXT;

CREATE INDEX IF NOT EXISTS idx_risk_analyses_pending
  ON public.risk_analyses (user_id, status)
  WHERE status = 'pending';

COMMENT ON COLUMN public.risk_analyses.status IS 'pending while generating in the background; done/error when finished. Existing rows default to done.';
COMMENT ON COLUMN public.risk_analyses.phase IS 'Coarse progress while pending: analyzing. Single-phase since the underlying Claude call is non-streaming.';
