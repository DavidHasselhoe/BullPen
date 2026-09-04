-- Persist the 5-category Financial Health breakdown alongside the existing
-- aggregate health_score/health_score_grade, so portfolio-level aggregation
-- (HealthBloom) can value-weight categories without recomputing per ticker.
-- Populated by the same two write paths as health_score/health_score_grade:
-- computeAndSyncHealthScore() (on-demand) and fetchAndUpsertScreenerStats()
-- (daily screener cron). No backfill — existing rows get NULLs until the
-- next on-demand compute or cron run touches them.
ALTER TABLE screener_stats
  ADD COLUMN IF NOT EXISTS health_profitability      SMALLINT, -- 0-30
  ADD COLUMN IF NOT EXISTS health_financial_strength SMALLINT, -- 0-25
  ADD COLUMN IF NOT EXISTS health_valuation          SMALLINT, -- 0-20
  ADD COLUMN IF NOT EXISTS health_growth             SMALLINT, -- 0-15
  ADD COLUMN IF NOT EXISTS health_market_risk        SMALLINT; -- 0-10
