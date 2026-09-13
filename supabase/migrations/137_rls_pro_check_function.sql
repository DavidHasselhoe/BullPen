-- 137: Pro checks in RLS go through one SECURITY DEFINER function.
--
-- Found while verifying 136. Migration 121 revoked table-wide SELECT on
-- public.users from `authenticated` and re-granted only profile columns, which
-- excludes role, account_tier and pro_bonus_until. Ten policies decide Pro
-- access with `EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND
-- (u.role = 'admin' OR u.account_tier >= 3 OR ...))`, so since 121 every one of
-- them fails for a signed-in session with "42501 permission denied for table
-- users" instead of evaluating. Reproduced as the QA account.
--
-- App impact was nil because the routes that touch these tables read and write
-- with the service role, which bypasses RLS (Postgres logs over the last 24h
-- show only the reproduction). It still left every Pro-gated policy a dead
-- letter for direct PostgREST access.
--
-- i_am_pro() reads only the caller's own row, runs as the table owner so the
-- column grants don't apply, and is wrapped in (select ...) in every policy so
-- it is evaluated once per query. It exposes nothing but the caller's own Pro
-- status. Same Pro definition as lib/billing/tier.ts: admin, account_tier >= 3,
-- or an unexpired pro_bonus_until.

CREATE OR REPLACE FUNCTION public.i_am_pro()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = auth.uid()
      AND (u.role = 'admin' OR u.account_tier >= 3 OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > now()))
  );
$$;

REVOKE ALL ON FUNCTION public.i_am_pro() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.i_am_pro() TO authenticated;

-- ---------------------------------------------------------------------------
-- Pro-gated reads
-- ---------------------------------------------------------------------------

ALTER POLICY "Authenticated users can read course quizzes" ON public.academy_course_quizzes
  USING (EXISTS (
    SELECT 1 FROM public.academy_courses c
    WHERE c.id = academy_course_quizzes.course_id
      AND c.is_published = true
      AND (c.requires_pro = false OR (select public.i_am_pro()))
  ));

ALTER POLICY "Authenticated users can read academy lessons" ON public.academy_lessons
  USING (EXISTS (
    SELECT 1 FROM public.academy_courses c
    WHERE c.id = academy_lessons.course_id
      AND c.is_published = true
      AND (c.requires_pro = false OR (select public.i_am_pro()))
  ));

ALTER POLICY "Pro and admin users can read daily briefs" ON public.daily_briefs
  USING ((select public.i_am_pro()));

ALTER POLICY "Pro and admin users can read institutional filings" ON public.institutional_filings
  USING ((select public.i_am_pro()));

ALTER POLICY "Pro and admin users can read institutional holdings" ON public.institutional_holdings
  USING ((select public.i_am_pro()));

-- ---------------------------------------------------------------------------
-- Academy lesson progress (Pro courses gated on write)
-- ---------------------------------------------------------------------------

ALTER POLICY "Users can insert own lesson progress" ON public.academy_user_lesson_progress
  WITH CHECK (
    (select auth.uid()) = user_id
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.academy_lessons l
        JOIN public.academy_courses c ON c.id = l.course_id
        WHERE l.id = academy_user_lesson_progress.lesson_id AND c.requires_pro = true
      )
      OR (select public.i_am_pro())
    )
  );

ALTER POLICY "Users can update own lesson progress" ON public.academy_user_lesson_progress
  USING ((select auth.uid()) = user_id)
  WITH CHECK (
    (select auth.uid()) = user_id
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.academy_lessons l
        JOIN public.academy_courses c ON c.id = l.course_id
        WHERE l.id = academy_user_lesson_progress.lesson_id AND c.requires_pro = true
      )
      OR (select public.i_am_pro())
    )
  );

-- ---------------------------------------------------------------------------
-- Free-tier limits
-- ---------------------------------------------------------------------------

ALTER POLICY "Users insert own watchlist lists" ON public.watchlist_lists
  WITH CHECK (
    (select auth.uid()) = user_id
    AND ((select public.i_am_pro()) OR public.my_watchlist_list_count() < 3)
  );

ALTER POLICY "Users insert own alerts" ON public.user_alerts
  WITH CHECK (
    (select auth.uid()) = user_id
    AND (
      NOT is_active
      OR (select public.i_am_pro())
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
      OR (select public.i_am_pro())
      OR public.my_has_active_alert_for_symbol(symbol, id)
      OR public.my_active_alert_symbol_count(id) < 5
    )
  );
