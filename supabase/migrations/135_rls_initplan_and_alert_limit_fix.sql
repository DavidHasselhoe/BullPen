-- 135: RLS policies evaluate auth.uid() once per query, not once per row,
-- and the free-tier alert limit actually applies.
--
-- 1. Supabase's performance advisor (auth_rls_initplan) flagged these 24
--    policies: a bare auth.uid() is re-evaluated for every row scanned, while
--    (select auth.uid()) is planned once as an initplan. ALTER POLICY keeps each
--    policy's name, command, roles and permissiveness; only the expressions
--    change, and they are otherwise identical to what is live.
--
-- 2. Real bug in 126's user_alerts policies. Inside the `existing` subqueries an
--    unqualified `symbol` / `id` resolves to the innermost table, so
--    `existing.symbol = symbol` compared existing.symbol with itself (always
--    true) and `existing.id <> id` compared existing.id with itself (always
--    false). Net effect: a free user with any active alert passed the INSERT
--    check for a new symbol, and every UPDATE passed its count check, so the
--    5-symbol cap could be bypassed by writing to PostgREST directly. Qualified
--    as user_alerts.symbol / user_alerts.id, the row being checked.
--
-- 3. Covering indexes for the four foreign keys the advisor flagged
--    (unindexed_foreign_keys).

-- ---------------------------------------------------------------------------
-- Pro-gated reads
-- ---------------------------------------------------------------------------

ALTER POLICY "Authenticated users can read course quizzes" ON public.academy_course_quizzes
  USING (EXISTS (
    SELECT 1 FROM public.academy_courses c
    WHERE c.id = academy_course_quizzes.course_id
      AND c.is_published = true
      AND (c.requires_pro = false OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = (select auth.uid())
          AND (u.role = 'admin' OR u.account_tier >= 3 OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > now()))
      ))
  ));

ALTER POLICY "Authenticated users can read academy lessons" ON public.academy_lessons
  USING (EXISTS (
    SELECT 1 FROM public.academy_courses c
    WHERE c.id = academy_lessons.course_id
      AND c.is_published = true
      AND (c.requires_pro = false OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = (select auth.uid())
          AND (u.role = 'admin' OR u.account_tier >= 3 OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > now()))
      ))
  ));

ALTER POLICY "Pro and admin users can read daily briefs" ON public.daily_briefs
  USING (EXISTS (
    SELECT 1 FROM public.users
    WHERE users.id = (select auth.uid())
      AND (users.role = 'admin' OR users.account_tier >= 3 OR (users.pro_bonus_until IS NOT NULL AND users.pro_bonus_until > now()))
  ));

ALTER POLICY "Pro and admin users can read institutional filings" ON public.institutional_filings
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (select auth.uid())
      AND (u.role = 'admin' OR u.account_tier >= 3 OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > now()))
  ));

ALTER POLICY "Pro and admin users can read institutional holdings" ON public.institutional_holdings
  USING (EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = (select auth.uid())
      AND (u.role = 'admin' OR u.account_tier >= 3 OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > now()))
  ));

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
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = (select auth.uid())
          AND (u.role = 'admin' OR u.account_tier >= 3 OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > now()))
      )
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
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = (select auth.uid())
          AND (u.role = 'admin' OR u.account_tier >= 3 OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > now()))
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Plain ownership policies
-- ---------------------------------------------------------------------------

ALTER POLICY "Users can manage their own conversations" ON public.ai_conversations
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users create their own feedback reports" ON public.feedback_reports
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users view their own feedback reports" ON public.feedback_reports
  USING ((select auth.uid()) = user_id);

ALTER POLICY "Users manage own holding purchases" ON public.holding_purchases
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users manage own holding sales" ON public.holding_sales
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users manage own holdings imports" ON public.holdings_imports
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users manage own holdings import events" ON public.holdings_import_events
  USING (import_id IN (SELECT holdings_imports.id FROM public.holdings_imports WHERE holdings_imports.user_id = (select auth.uid())))
  WITH CHECK (import_id IN (SELECT holdings_imports.id FROM public.holdings_imports WHERE holdings_imports.user_id = (select auth.uid())));

ALTER POLICY "Users create their own shares" ON public.portfolio_shares
  WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users view their own shares" ON public.portfolio_shares
  USING ((select auth.uid()) = user_id);

ALTER POLICY "Users manage own screener filter presets" ON public.screener_filter_presets
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users manage own institution follows" ON public.user_institution_follows
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Watchlist lists (3-list free cap on insert)
-- ---------------------------------------------------------------------------

ALTER POLICY "Users read own watchlist lists" ON public.watchlist_lists
  USING ((select auth.uid()) = user_id);

ALTER POLICY "Users update own watchlist lists" ON public.watchlist_lists
  USING ((select auth.uid()) = user_id) WITH CHECK ((select auth.uid()) = user_id);

ALTER POLICY "Users delete own watchlist lists" ON public.watchlist_lists
  USING ((select auth.uid()) = user_id);

ALTER POLICY "Users insert own watchlist lists" ON public.watchlist_lists
  WITH CHECK (
    (select auth.uid()) = user_id
    AND (
      EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = (select auth.uid())
          AND (u.role = 'admin' OR u.account_tier >= 3 OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > now()))
      )
      OR (SELECT count(*) FROM public.watchlist_lists existing WHERE existing.user_id = (select auth.uid())) < 3
    )
  );

-- ---------------------------------------------------------------------------
-- User alerts (5-symbol free cap), with the self-comparison bug fixed
-- ---------------------------------------------------------------------------

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
      OR EXISTS (
        SELECT 1 FROM public.user_alerts existing
        WHERE existing.user_id = (select auth.uid())
          AND existing.symbol = user_alerts.symbol
          AND existing.is_active
      )
      OR (
        SELECT count(DISTINCT existing.symbol) FROM public.user_alerts existing
        WHERE existing.user_id = (select auth.uid()) AND existing.is_active
      ) < 5
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
      OR EXISTS (
        SELECT 1 FROM public.user_alerts existing
        WHERE existing.user_id = (select auth.uid())
          AND existing.symbol = user_alerts.symbol
          AND existing.is_active
          AND existing.id <> user_alerts.id
      )
      OR (
        SELECT count(DISTINCT existing.symbol) FROM public.user_alerts existing
        WHERE existing.user_id = (select auth.uid())
          AND existing.is_active
          AND existing.id <> user_alerts.id
      ) < 5
    )
  );

-- ---------------------------------------------------------------------------
-- Foreign-key covering indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_academy_user_quiz_attempts_course_id ON public.academy_user_quiz_attempts (course_id);
CREATE INDEX IF NOT EXISTS idx_holding_sales_original_holding_id ON public.holding_sales (original_holding_id);
CREATE INDEX IF NOT EXISTS idx_security_events_user_id ON public.security_events (user_id);
CREATE INDEX IF NOT EXISTS idx_stripe_trial_fingerprints_user_id ON public.stripe_trial_fingerprints (user_id);
