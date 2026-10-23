-- ---------------------------------------------------------------------------
-- Add Harvard Management Co Inc to the 13F tracker.
--
-- The company that invests Harvard University's endowment. CIK 1082621,
-- EDGAR conformed name "HARVARD MANAGEMENT CO INC", a 13F-HR every quarter;
-- newest is period 2026-06-30, filed 2026-08-14 (0001193125-26-352412,
-- 19 positions, $4,263,102,872). Verified against data.sec.gov/submissions
-- on 2026-10-23.
--
-- The 13F only covers US-listed equity, a few percent of a ~$57B endowment,
-- so the description says so rather than implying it is the whole portfolio.
--
-- manager_name is the CEO, N.P. Narvekar (since December 2016; reported in
-- May 2026 to plan retiring as early as fall 2027, so recheck then).
--
-- sort_order 200 puts it after Thiel Macro (190), the current last slot.
-- No logo_url: the initials avatar until a mark is imported by hand
-- (scripts/import-institution-logo.ts).
--
-- Holdings arrive from the weekly sync cron, or on demand via
-- scripts/backfill-institution-filings.ts --slug=harvard-management.
-- ---------------------------------------------------------------------------

INSERT INTO public.institutional_investors (slug, cik, display_name, manager_name, description, sort_order) VALUES
  ('harvard-management', '1082621', 'Harvard Management Co Inc', 'N.P. Narvekar', 'Invests Harvard University''s endowment. Its 13F lists only US-listed stocks, a small part of the whole endowment.', 200)
ON CONFLICT (slug) DO UPDATE
  SET cik          = EXCLUDED.cik,
      display_name = EXCLUDED.display_name,
      manager_name = EXCLUDED.manager_name,
      description  = EXCLUDED.description,
      sort_order   = EXCLUDED.sort_order,
      is_active    = TRUE,
      updated_at   = NOW();
