-- The score a health-score grade alert was last measured from. Daily grade
-- alerts compare against this baseline, not yesterday's score, so a stock
-- sitting on a cut-off (GOOGL at exactly 85, the A/B line) cannot send
-- "dropped to B" one day and "improved to A" the next. The baseline only
-- moves when an alert fires, the scoring method changes, or the grade is
-- unchanged (see lib/market-data/screener-stats.ts).
ALTER TABLE screener_stats ADD COLUMN IF NOT EXISTS health_alert_score smallint;

UPDATE screener_stats SET health_alert_score = health_score WHERE health_alert_score IS NULL;
