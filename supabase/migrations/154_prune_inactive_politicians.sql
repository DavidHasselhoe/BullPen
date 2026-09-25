-- ---------------------------------------------------------------------------
-- Prune the Washington Trading roster to members who still trade stocks.
--
-- Audited 2026-09-25 against congress_trades (last ingest 2026-09-23). Rule:
-- a member is shown only if they have disclosed a stock trade (a row with a
-- ticker) in the last 12 months. Everyone below fails it, for one of two
-- reasons. Deactivated, not deleted: their trades and positions stay stored,
-- and flipping is_active back restores them.
--
-- No longer in office, so they will never file again:
--   trey-hollingsworth  left the House Jan 2023     last stock trade 2022-10-24
--   peter-meijer        left the House Jan 2023     last stock trade 2022-06-27
--   doug-lamborn        retired Jan 2025            last stock trade 2024-12-04
--   kamala-harris       left office Jan 2025        last stock trade 2024-12-27
--
-- In office, but no stock trade in over a year:
--   roger-marshall      last stock trade 2021-03-01
--   dan-sullivan        last stock trade 2024-01-24
--   daniel-goldman      last stock trade 2025-02-11
--   linda-mcmahon       last stock trade 2025-06-12, 0 open positions
--   judy-chu            last stock trade 2025-08-19
--   scott-peters        no stock trade at all in his stored 100: every row is
--                       a bond or muni with no ticker, so his trade list on the
--                       member page rendered empty
--
-- Besides cleaning the grid, this cuts the twice-weekly refresh cron from 29
-- to 19 members (~1,015 -> ~665 credits a run).
-- ---------------------------------------------------------------------------

UPDATE public.congress_politicians
SET is_active = false
WHERE slug IN (
  'trey-hollingsworth', 'peter-meijer', 'doug-lamborn', 'kamala-harris',
  'roger-marshall', 'dan-sullivan', 'daniel-goldman', 'linda-mcmahon',
  'judy-chu', 'scott-peters'
);
