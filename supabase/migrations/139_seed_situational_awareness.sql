-- ---------------------------------------------------------------------------
-- Add Situational Awareness LP to the 13F tracker.
--
-- Leopold Aschenbrenner's fund. CIK 2045724, EDGAR conformed name
-- "Situational Awareness LP", a 13F-HR every quarter since period
-- 2024-12-31; newest is period 2026-06-30, filed 2026-08-14. Verified against
-- EDGAR on 2026-09-14.
--
-- Not CIK 2038540, "Situational Awareness Partners LP": one 13F-HR ever
-- (filed 2026-05-18), otherwise only Form D, so its card would go stale.
--
-- This fund reports large option positions (puts on chipmakers in Q1 2026,
-- calls alongside shares of the same issuer in Q2), which is why it waited on
-- migration 138 keeping options apart from shares.
--
-- sort_order 180 puts it after Citadel (170), the current last slot.
-- No logo_url: the initials avatar until a mark is imported by hand
-- (scripts/import-institution-logo.ts).
--
-- Holdings arrive from the weekly sync cron, or on demand via
-- scripts/backfill-institution-filings.ts --slug=situational-awareness.
-- ---------------------------------------------------------------------------

INSERT INTO public.institutional_investors (slug, cik, display_name, manager_name, description, sort_order) VALUES
  ('situational-awareness', '2045724', 'Situational Awareness LP', 'Leopold Aschenbrenner', 'AI-focused hedge fund founded by Leopold Aschenbrenner.', 180)
ON CONFLICT (slug) DO UPDATE
  SET cik          = EXCLUDED.cik,
      display_name = EXCLUDED.display_name,
      manager_name = EXCLUDED.manager_name,
      description  = EXCLUDED.description,
      sort_order   = EXCLUDED.sort_order,
      is_active    = TRUE,
      updated_at   = NOW();
