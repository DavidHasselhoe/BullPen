-- Stage A of paywall: per-call AI cost logging.
-- Every Anthropic/OpenAI call from a costly route inserts one row here.
-- The quota system (lib/billing/quotas.ts) counts rows in this table to
-- decide whether a free user can make another call.

CREATE TABLE ai_usage (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,  -- nullable for cron jobs (e.g. daily_brief)
  feature       TEXT NOT NULL,             -- 'portfolio_builder' | 'chat' | 'why_today' | 'compare_explain' | 'risk_analysis' | 'competitors' | 'daily_brief'
  model         TEXT NOT NULL,             -- 'claude-sonnet-4-6' | 'gpt-4o' | 'gpt-4o-mini' | ...
  input_tokens  INTEGER,
  output_tokens INTEGER,
  cost_usd      NUMERIC(12, 6) NOT NULL DEFAULT 0,
  status        TEXT NOT NULL DEFAULT 'success',  -- 'success' | 'error' | 'blocked'
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quota check uses this index (per-user, per-feature, recent first)
CREATE INDEX ai_usage_user_feature_time ON ai_usage(user_id, feature, created_at DESC);

-- Admin dashboard uses this index (recent first, all features)
CREATE INDEX ai_usage_created_at ON ai_usage(created_at DESC);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;

-- Users can read their own usage rows
CREATE POLICY "Users read own ai_usage"
  ON ai_usage FOR SELECT
  USING (auth.uid() = user_id);

-- Admins (account_tier >= 2) can read everyone's rows (for /admin/costs dashboard)
CREATE POLICY "Admins read all ai_usage"
  ON ai_usage FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.account_tier >= 2
    )
  );

-- Only the service role inserts rows (server-side via createServerClient)
-- No INSERT policy for authenticated users → enforced by service-role-only writes.
