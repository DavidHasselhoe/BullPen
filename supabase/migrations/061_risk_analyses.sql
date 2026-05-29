-- Risk Analyses
-- Per-user saved portfolio risk analysis reports.
-- Generated on demand; saved so users can revisit without regenerating.
-- Gating (Pro/quota) is enforced in the API route, not in RLS.

CREATE TABLE IF NOT EXISTS public.risk_analyses (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  analysis     JSONB       NOT NULL,   -- Full RiskAnalysis JSON including generatedAt
  currency     TEXT        NOT NULL DEFAULT 'USD',
  holdings_count INTEGER,              -- How many holdings were in scope
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_analyses_user_created
  ON public.risk_analyses (user_id, created_at DESC);

COMMENT ON TABLE  public.risk_analyses IS 'Per-user saved portfolio risk analysis reports.';
COMMENT ON COLUMN public.risk_analyses.analysis IS 'Full RiskAnalysis JSON: overallRiskScore, riskLevel, metrics, topRisks, stressScenarios, sectorBreakdown, recommendations, portfolioSummary, generatedAt.';

ALTER TABLE public.risk_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own risk analyses"
  ON public.risk_analyses FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own risk analyses"
  ON public.risk_analyses FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own risk analyses"
  ON public.risk_analyses FOR DELETE
  USING (auth.uid() = user_id);
