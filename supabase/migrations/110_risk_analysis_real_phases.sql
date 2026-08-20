-- 110_risk_analysis_real_phases.sql
-- Documentation-only: the risk-analysis Claude call is now streamed instead
-- of a single non-streaming request, so `phase` carries real, verifiable
-- progress (scoring -> identifying_risks -> modeling_scenarios -> finalizing)
-- detected from the structured JSON output as it's generated, replacing the
-- old single 'analyzing' placeholder and the client's decorative tick-off.
-- No column/constraint change — `phase` was already free TEXT.

COMMENT ON COLUMN public.risk_analyses.phase IS 'Progress while pending: scoring, identifying_risks, modeling_scenarios, finalizing -- each reached only once its JSON key has appeared in the streamed Claude response. Set in app/api/holdings/risk-analysis/route.ts.';
