-- Daily Briefs table
-- One row per calendar date, shared across all pro users.
-- Generated once per day by the generate-daily-brief cron job.
-- Gating (account_tier >= 3) is enforced in the API route, not in RLS.

CREATE TABLE IF NOT EXISTS daily_briefs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  published_date   DATE        UNIQUE NOT NULL,
  title            TEXT        NOT NULL,
  content          TEXT        NOT NULL,  -- Full brief as markdown (## section headers)
  featured_tickers TEXT[]      DEFAULT '{}',
  generated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_briefs_date ON daily_briefs (published_date DESC);

ALTER TABLE daily_briefs ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read any brief (tier check is in the API route)
CREATE POLICY "Authenticated users can read daily briefs"
  ON daily_briefs FOR SELECT
  TO authenticated
  USING (true);

-- No client INSERT/UPDATE — written only by service role via the cron job
