-- User-defined price/metric alerts
-- One row per alert. Cron at /api/cron/check-user-alerts evaluates them
-- and writes to the existing `notifications` table on trigger.

CREATE TABLE IF NOT EXISTS user_alerts (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol             VARCHAR(20) NOT NULL,
  company_name       TEXT,
  alert_type         TEXT NOT NULL CHECK (alert_type IN (
    'price_above',
    'price_below',
    'pct_change_up',
    'pct_change_down',
    'near_52w_high',
    'near_52w_low',
    'all_time_high'
  )),
  threshold          NUMERIC NOT NULL,
  baseline_value     NUMERIC,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE,
  last_triggered_at  TIMESTAMPTZ,
  trigger_count      INT NOT NULL DEFAULT 0,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_alerts_user        ON user_alerts(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_user_alerts_symbol_act  ON user_alerts(symbol) WHERE is_active = TRUE;

ALTER TABLE user_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own alerts"   ON user_alerts;
CREATE POLICY "Users read own alerts"
  ON user_alerts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users insert own alerts" ON user_alerts;
CREATE POLICY "Users insert own alerts"
  ON user_alerts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users update own alerts" ON user_alerts;
CREATE POLICY "Users update own alerts"
  ON user_alerts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users delete own alerts" ON user_alerts;
CREATE POLICY "Users delete own alerts"
  ON user_alerts FOR DELETE
  USING (auth.uid() = user_id);
