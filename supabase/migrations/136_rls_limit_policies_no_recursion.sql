-- 136: the free-tier limit policies on user_alerts and watchlist_lists no
-- longer query their own table.
--
-- Found while verifying 135. Migration 126 added limit checks that count the
-- caller's existing rows with a subquery on the same table the policy protects.
-- Postgres rejects that outright: any write made as a normal signed-in user
-- (INSERT on either table, UPDATE on user_alerts) fails with
-- "42P17 infinite recursion detected in policy". Reproduced for both tables as
-- the QA account in a rolled-back transaction.
--
-- The app never hit it because its alert and watchlist routes write with the
-- service role, which bypasses RLS. So the practical effect of 126 was that
-- direct PostgREST writes to these tables were impossible, not that the limits
-- held. It also means the self-comparison bug described in 135 was unreachable
-- rather than exploitable; 135's column qualification is still correct.
--
-- Fix: the counts move into SECURITY DEFINER functions. They run as the table
-- owner, so their internal query is not subject to RLS and cannot recurse.
-- They take no user id and read only auth.uid()'s own rows, so calling them via
-- /rest/v1/rpc reveals nothing beyond the caller's own counts. EXECUTE is
-- limited to signed-in users.

CREATE OR REPLACE FUNCTION public.my_active_alert_symbol_count(exclude_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(DISTINCT symbol)::integer
  FROM public.user_alerts
  WHERE user_id = auth.uid()
    AND is_active
    AND (exclude_id IS NULL OR id <> exclude_id);
$$;

CREATE OR REPLACE FUNCTION public.my_has_active_alert_for_symbol(p_symbol text, exclude_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_alerts
    WHERE user_id = auth.uid()
      AND is_active
      AND symbol = p_symbol
      AND (exclude_id IS NULL OR id <> exclude_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.my_watchlist_list_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer FROM public.watchlist_lists WHERE user_id = auth.uid();
$$;

REVOKE ALL ON FUNCTION public.my_active_alert_symbol_count(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_has_active_alert_for_symbol(text, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.my_watchlist_list_count() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_active_alert_symbol_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_has_active_alert_for_symbol(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_watchlist_list_count() TO authenticated;

ALTER POLICY "Users insert own alerts" ON public.user_alerts
  WITH CHECK (
    (select auth.uid()) = user_id
    AND (
      NOT is_active
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = (select auth.uid())
          AND (u.role = 'admin' OR u.account_tier >= 3 OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > now()))
      )
      OR public.my_has_active_alert_for_symbol(symbol)
      OR public.my_active_alert_symbol_count() < 5
    )
  );

ALTER POLICY "Users update own alerts" ON public.user_alerts
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND (
      NOT is_active
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = (select auth.uid())
          AND (u.role = 'admin' OR u.account_tier >= 3 OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > now()))
      )
      OR public.my_has_active_alert_for_symbol(symbol, id)
      OR public.my_active_alert_symbol_count(id) < 5
    )
  );

ALTER POLICY "Users insert own watchlist lists" ON public.watchlist_lists
  WITH CHECK (
    (select auth.uid()) = user_id
    AND (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = (select auth.uid())
          AND (u.role = 'admin' OR u.account_tier >= 3 OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > now()))
      )
      OR public.my_watchlist_list_count() < 3
    )
  );
