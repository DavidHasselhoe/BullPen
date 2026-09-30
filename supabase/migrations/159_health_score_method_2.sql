-- Financial Health Score method 2 (lib/finance/health-score.ts).
--
-- The score now measures business quality and financial safety only: the
-- Valuation pillar left the total and a Cash Flow pillar took its 20 points.
-- health_valuation stays, as an informational "how cheap" read the theme
-- Value sort uses, but no longer adds to health_score.
--
-- health_score_version / method record which method produced a number, so a
-- grade that moved only because the method changed never triggers a "grade
-- changed" notification, and history trends only compare like with like.
-- Existing rows default to 1 (the old method) until they are rescored.

ALTER TABLE screener_stats
  ADD COLUMN IF NOT EXISTS health_cash_flow     SMALLINT,                     -- 0-20
  ADD COLUMN IF NOT EXISTS health_score_version SMALLINT NOT NULL DEFAULT 1;

ALTER TABLE health_score_history
  ADD COLUMN IF NOT EXISTS method SMALLINT NOT NULL DEFAULT 1;
