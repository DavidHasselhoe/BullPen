-- ---------------------------------------------------------------------------
-- Add Thiel Macro LLC to the 13F tracker.
--
-- Peter Thiel's macro fund. CIK 1562087, EDGAR conformed name
-- "Thiel Macro LLC", the only entity EDGAR full-text search returns for the
-- name. A 13F-HR every quarter since period 2024-12-31 (after a gap from
-- period 2020-09-30); newest is period 2026-06-30, filed 2026-08-14.
-- Verified against data.sec.gov/submissions on 2026-10-06.
--
-- sort_order 190 puts it after Situational Awareness (180), the current last
-- slot. No logo_url: the initials avatar until a mark is imported by hand
-- (scripts/import-institution-logo.ts).
--
-- Holdings arrive from the weekly sync cron, or on demand via
-- scripts/backfill-institution-filings.ts --slug=thiel-macro.
-- ---------------------------------------------------------------------------

INSERT INTO public.institutional_investors (slug, cik, display_name, manager_name, description, sort_order) VALUES
  ('thiel-macro', '1562087', 'Thiel Macro LLC', 'Peter Thiel', 'Macro hedge fund run by Peter Thiel, PayPal co-founder and early Facebook investor.', 190)
ON CONFLICT (slug) DO UPDATE
  SET cik          = EXCLUDED.cik,
      display_name = EXCLUDED.display_name,
      manager_name = EXCLUDED.manager_name,
      description  = EXCLUDED.description,
      sort_order   = EXCLUDED.sort_order,
      is_active    = TRUE,
      updated_at   = NOW();
