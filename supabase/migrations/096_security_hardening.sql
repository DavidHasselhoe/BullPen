-- 096_security_hardening.sql
-- Closes gaps found in a full security audit (payments, RLS, API auth):
--
--  1. public.users allowed any authenticated user to UPDATE their own `role`,
--     `account_tier`, and stripe_* columns — RLS's USING/WITH CHECK restrict
--     which ROW can be updated (auth.uid() = id) but not which COLUMNS, so a
--     user could self-grant admin/Pro via a plain client-side update. Closed
--     with a column-level REVOKE (Postgres GRANT/REVOKE is the only way to
--     restrict columns; RLS is row-only). Verified no legitimate app code
--     updates these columns via the browser/anon-key client for any row —
--     ProfileModal/SettingsModal only ever write full_name/username/bio/
--     experience_level/market_focus/risk_profile/avatar_url; account_tier/
--     role/stripe_* are only ever written by app/api/billing/webhook/route.ts
--     and admin scripts, both on the service-role client (unaffected by a
--     REVOKE against `authenticated`).
--
--  2. public.users and public.user_holdings SELECT policies were
--     `auth.uid() IS NOT NULL OR auth.uid() = id` — the first clause subsumes
--     the second, so this was really just "any authenticated user, every
--     row, every column" — including users who never opted into a public
--     profile, and including sensitive columns (email, stripe_status, role
--     on users; quantity/avg_price/brokerage_account_id on user_holdings)
--     that the app's own API routes deliberately never select for other
--     users. Tightened to owner-or-explicitly-public, matching what
--     `settings->>'profile_public'` / `settings->>'holdings_public'` already
--     mean everywhere else in the app (default true, explicit false opts
--     out) — the app-layer checks in app/api/users/[username]/route.ts and
--     activity/route.ts now match what the database itself allows, instead
--     of relying entirely on the app never having a bug.
--
--     NOTE (residual, intentionally not fixed here): this is a row-level
--     fix, not a column-level one — RLS cannot restrict which columns are
--     visible on a row that IS visible, so a user who keeps the default
--     public profile can still have `email`/`stripe_status`/`role` selected
--     by another authenticated user issuing a raw `select('email')` query
--     directly against PostgREST (the app's own UI never does this, since
--     every route that reads *other* users already uses an explicit column
--     whitelist). Fully closing that requires routing all cross-user reads
--     through a view or RPC that projects only safe columns, and auditing/
--     migrating every consumer (users/[username], activity, social/feed,
--     follow, thesis + replies) to use it — a larger, separate change.
--
--  3. public.portfolio_activity had `USING (true)` for all authenticated
--     users, bypassing the same holdings_public toggle the profile Activity
--     tab (app/api/users/[username]/activity/route.ts) already checks in
--     code. Same fix shape as (2).
--
-- Verified before writing: every consumer of users/user_holdings/
-- portfolio_activity via an RLS-subject client (browser client or the
-- anon-key @supabase/ssr server client) either (a) filters by the caller's
-- own id already (AuthProvider, use-user-settings, ProfileModal,
-- SettingsModal, lib/auth/*, holdings actions — all `.eq('id'/'user_id',
-- <own id>)`, unaffected by tightening cross-user visibility), or (b) reads
-- *other* users' public info for a legitimate feature (public profile page,
-- activity tab, social feed/follow/thesis) and needs exactly the
-- owner-or-public rule this migration adds. Admin/service-role paths
-- (admin/costs, users/search) use the service-role client, which bypasses
-- RLS and column grants entirely — unaffected either way.

-- ── 1. users: block self-privilege-escalation via column-level REVOKE ──────
REVOKE UPDATE (role, account_tier, stripe_customer_id, stripe_subscription_id, stripe_status)
  ON public.users FROM authenticated;

-- ── 2. users: SELECT scoped to owner or explicitly-public profile ──────────
DROP POLICY IF EXISTS "Read profiles" ON public.users;
CREATE POLICY "Read own or public profile"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) = id
    OR COALESCE((settings->>'profile_public')::boolean, true) = true
  );

-- ── 3. user_holdings: SELECT scoped to owner or public-profile+holdings ────
DROP POLICY IF EXISTS "Read holdings" ON public.user_holdings;
CREATE POLICY "Read own or public holdings"
  ON public.user_holdings FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_holdings.user_id
        AND COALESCE((u.settings->>'profile_public')::boolean, true) = true
        AND COALESCE((u.settings->>'holdings_public')::boolean, true) = true
    )
  );

-- ── 4. portfolio_activity: same owner-or-public rule ────────────────────────
DROP POLICY IF EXISTS "Authenticated users can read portfolio activity" ON public.portfolio_activity;
CREATE POLICY "Read own or public portfolio activity"
  ON public.portfolio_activity FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = portfolio_activity.user_id
        AND COALESCE((u.settings->>'profile_public')::boolean, true) = true
        AND COALESCE((u.settings->>'holdings_public')::boolean, true) = true
    )
  );
