-- ---------------------------------------------------------------------------
-- Re-add Appaloosa to the 13F tracker under its live CIK.
--
-- Migration 130 dropped it along with Scion and Greenlight because its card
-- was stuck on a 2015 filing. Scion and Greenlight really have stopped
-- filing; Appaloosa had not. The manager re-registered in 2016 and the CIK
-- seeded in migration 127 (1006438, "APPALOOSA MANAGEMENT LP") is a retired
-- entity whose last 13F-HR was period 2015-12-31, filed 2016-02-12.
--
-- The live filer is CIK 1656456, EDGAR conformed name "Appaloosa LP", whose
-- newest 13F-HR is period 2026-06-30, filed 2026-08-14 -- same quarter as
-- every other fund on the board. Verified against data.sec.gov/submissions
-- on 2026-09-08.
--
-- display_name follows EDGAR's conformed name, as every other row here does.
-- sort_order 80 is the slot Appaloosa held before, so it lands back between
-- Baupost and Renaissance rather than at the end of the grid.
--
-- No logo_url on purpose: logo.dev has nothing for appaloosalp.com or
-- appaloosamanagement.com, and the near-miss domains belong to other people
-- (see scripts/backfill-institution-logos.ts). The initials avatar is the
-- correct outcome.
--
-- Holdings arrive from the weekly sync cron, or on demand via
-- /api/cron/sync-institutional-holdings?slug=appaloosa.
-- ---------------------------------------------------------------------------

INSERT INTO public.institutional_investors (slug, cik, display_name, manager_name, description, sort_order) VALUES
  ('appaloosa', '1656456', 'Appaloosa LP', 'David Tepper', 'Distressed-debt and equity hedge fund run by David Tepper.', 80)
ON CONFLICT (slug) DO UPDATE
  SET cik          = EXCLUDED.cik,
      display_name = EXCLUDED.display_name,
      manager_name = EXCLUDED.manager_name,
      description  = EXCLUDED.description,
      sort_order   = EXCLUDED.sort_order,
      is_active    = TRUE,
      updated_at   = NOW();
