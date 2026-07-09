-- Financial Health Score history — one row per ticker per fiscal quarter,
-- written when a new quarterly report is detected (not on every daily
-- recompute). Powers the trend badge + history chart on the Health Score
-- card. No backfill: history starts accumulating from when this ships.

CREATE TABLE IF NOT EXISTS health_score_history (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticker        TEXT        NOT NULL,
  fiscal_date   TEXT        NOT NULL,        -- period identifier from income[0].fiscal_date; dedup key
  snapshot_date DATE        NOT NULL,        -- date we actually recorded this row
  score         SMALLINT    NOT NULL,
  grade         TEXT        NOT NULL,
  categories    JSONB       NOT NULL,        -- full HealthScore.categories breakdown, stored for a future per-category view
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (ticker, fiscal_date)
);

CREATE INDEX IF NOT EXISTS idx_health_score_history_ticker
  ON health_score_history (ticker, snapshot_date DESC);

ALTER TABLE health_score_history ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read any ticker's history (matches how the
-- current-score route itself is gated — withAuth, no tier check)
CREATE POLICY "Authenticated users can read health score history"
  ON health_score_history FOR SELECT
  TO authenticated
  USING (true);

-- No client INSERT/UPDATE/DELETE — written only by service role
-- (the screener refresh cron and the per-ticker health-score route)
