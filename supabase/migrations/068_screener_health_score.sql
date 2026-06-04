-- Add BullPen financial health score to the screener universe.
-- Populated by the daily screener refresh cron alongside the existing stats.

ALTER TABLE screener_stats
  ADD COLUMN IF NOT EXISTS health_score       SMALLINT,   -- 0–100 aggregate score
  ADD COLUMN IF NOT EXISTS health_score_grade TEXT;       -- 'A' | 'B' | 'C' | 'D' | 'F'
