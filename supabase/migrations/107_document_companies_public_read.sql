-- 107_document_companies_public_read.sql
-- Security audit finding: `companies` has had RLS enabled since
-- 001_initial_schema.sql, but that migration's only policy was written as a
-- commented-out example and never uncommitted. A "Companies are publicly
-- readable" SELECT policy exists on the live database today (confirmed via
-- pg_policies) — company ticker/name/sector/cik is non-sensitive reference
-- data read directly by client components (e.g. HoldingsTable.tsx via
-- createBrowserClient()), so this is the correct, intentional policy. It just
-- predates or fell outside the migration history, unlike every other
-- no-policy table in this schema (contact_submissions, instagram_posts,
-- ai_stock_picks), which document their service-role-only rationale inline.
-- This migration backfills that documentation and makes the policy
-- reproducible from the migration history going forward.
DROP POLICY IF EXISTS "Companies are publicly readable" ON public.companies;
CREATE POLICY "Companies are publicly readable"
  ON public.companies FOR SELECT
  TO anon, authenticated
  USING (true);
