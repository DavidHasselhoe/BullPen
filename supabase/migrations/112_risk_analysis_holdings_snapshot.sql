-- 112_risk_analysis_holdings_snapshot.sql
-- Adds a minimal holdings fingerprint to each saved risk analysis so a later
-- run can tell whether the portfolio actually changed since the last run.
-- Without this, risk_analyses only stored holdings_count (a number), which
-- can't distinguish "identical holdings" from "same count, different mix" --
-- the score was re-derived from scratch by the LLM every time, so normal
-- sampling variance alone produced swings like 65 -> 72 on an unchanged
-- portfolio. See app/api/holdings/risk-analysis/route.ts.

ALTER TABLE public.risk_analyses
  ADD COLUMN IF NOT EXISTS holdings_snapshot JSONB;

COMMENT ON COLUMN public.risk_analyses.holdings_snapshot IS
  'Minimal position fingerprint at the time of this run: [{symbol, quantity}]. Used to detect whether the portfolio actually changed since the last analysis, so the score can be anchored instead of re-rolled from LLM sampling noise alone. Older rows (pre-migration) are NULL, treated as no prior snapshot to compare.';
