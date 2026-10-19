-- Make the database's visibility rule match the app's: opt-in.
--
-- e1a01320 (2026-10-05) changed lib/social/visibility.ts so a profile is public
-- only when settings.profile_public === true, and its holdings only when
-- holdings_public === true as well. The RLS policies from 096 were never
-- updated and still treat a missing key as public (COALESCE(..., true)). Any
-- signed-in account could therefore query PostgREST with the anon key and read
-- the profile columns (full_name, bio, settings, last_login_at...) of 24 of 25
-- users, and the holdings of anyone who never opened the privacy settings.
--
-- Owner access is unchanged. Service-role paths bypass RLS and are unaffected.

DROP POLICY IF EXISTS "Read own or public profile" ON public.users;
CREATE POLICY "Read own or public profile"
  ON public.users FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) = id
    OR COALESCE((settings->>'profile_public')::boolean, false) = true
  );

DROP POLICY IF EXISTS "Read own or public holdings" ON public.user_holdings;
CREATE POLICY "Read own or public holdings"
  ON public.user_holdings FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = user_holdings.user_id
        AND COALESCE((u.settings->>'profile_public')::boolean, false) = true
        AND COALESCE((u.settings->>'holdings_public')::boolean, false) = true
    )
  );

DROP POLICY IF EXISTS "Read own or public portfolio activity" ON public.portfolio_activity;
CREATE POLICY "Read own or public portfolio activity"
  ON public.portfolio_activity FOR SELECT
  TO authenticated
  USING (
    (select auth.uid()) = user_id
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = portfolio_activity.user_id
        AND COALESCE((u.settings->>'profile_public')::boolean, false) = true
        AND COALESCE((u.settings->>'holdings_public')::boolean, false) = true
    )
  );
