-- 098_lockdown_academy_daily_challenges.sql
-- academy_daily_challenges granted SELECT to `authenticated` "so the app can
-- read the question" (migration 069), but the app's only consumer
-- (app/api/academy/daily/route.ts) reads it exclusively via the
-- SERVICE-ROLE client, which bypasses RLS regardless of policy. Confirmed via
-- repo-wide search: no browser/RLS-subject client ever queries this table.
--
-- That means the policy served no real purpose and only let any logged-in
-- user query the raw table directly (browser Supabase client / PostgREST) and
-- read `correct_index` — the quiz answer key — before answering, defeating
-- the API route's own "strip correct_index before responding" logic.
--
-- Dropping it entirely (rather than trying to hide just correct_index, which
-- RLS can't do at the column level) — service-role access is unaffected.

DROP POLICY IF EXISTS "Authed read daily challenges" ON public.academy_daily_challenges;
