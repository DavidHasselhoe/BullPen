-- 121_users_column_scoping.sql
-- Closes the residual RLS gap documented in 096_security_hardening.sql:
-- RLS restricts which ROWS are visible (owner or public-profile), but not
-- which COLUMNS on a visible row -- so any authenticated user could read
-- another public-profile user's email/role/account_tier/stripe_status by
-- issuing a raw PostgREST `select=email` query directly, even though the
-- app's own UI never does this. Verified live 2026-09-03 against
-- production grants: `authenticated` had a blanket `GRANT SELECT ON
-- public.users` from an earlier migration, covering every column.
--
-- Two approaches were tried and reverted before this one (both confirmed
-- broken via an empirical two-user test, not just reasoned about):
--  1. A masking view (`users_safe`) with CASE-WHEN-null'd sensitive columns.
--     Broken because the view runs with its owner's (`postgres`) privileges
--     by default, and `postgres` has an explicit rolbypassrls=true grant in
--     this project -- FORCE ROW LEVEL SECURITY on the base table cannot
--     override an explicit BYPASSRLS grant, so the view silently exposed
--     every row, including private profiles, to every authenticated user.
--  2. `REVOKE SELECT (email, role, ...) ON users FROM authenticated` on its
--     own. Broken because Postgres column privileges are additive on top of
--     table-level grants, not subtractive from them -- the existing
--     table-wide SELECT grant still covered those columns regardless.
--
-- What actually works: revoke the table-wide grant entirely and re-grant
-- SELECT on only the safe columns (allowlist, not denylist) -- confirmed
-- empirically that a cross-user raw read of a sensitive column is now
-- rejected with "permission denied for table users". For the app's own
-- need to read a user's FULL row (including sensitive columns) for their
-- OWN profile, a SECURITY DEFINER function scoped hard to `auth.uid() =
-- id` covers it without needing to duplicate or drift from the RLS row
-- policy, since it never returns another user's row at all. Every
-- browser-client consumer of `users` in this codebase was audited: only
-- AuthProvider.tsx and lib/auth/auth.ts read the full row, and both only
-- ever read the CALLER's own row (post signup/login) -- this function
-- covers exactly that. No browser-client consumer reads another user's row
-- anywhere in the app; every cross-user read (public profile, activity
-- feed, social, follow) already goes through a server API route on the
-- service-role client, unaffected by any of this.

REVOKE SELECT ON public.users FROM authenticated;

GRANT SELECT (
  id, username, full_name, avatar_url, created_at, updated_at,
  last_login_at, bio, experience_level, market_focus, risk_profile, settings
) ON public.users TO authenticated;

CREATE OR REPLACE FUNCTION public.get_own_profile()
RETURNS public.users
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT * FROM public.users WHERE id = (select auth.uid());
$$;

GRANT EXECUTE ON FUNCTION public.get_own_profile() TO authenticated;
