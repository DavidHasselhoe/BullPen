-- 125_fix_pro_gating_rls_and_referral_replay.sql
-- Follow-up sweep after 124: that fix's replay guard read/wrote
-- users.settings, a column normal app flows (and any user directly) can
-- freely rewrite (097_fix_users_update_grant.sql grants UPDATE(settings) to
-- authenticated) -- clearing settings.acquired_via_share_id and re-calling
-- the RPC re-grants a free month indefinitely. This moves the guard onto a
-- column authenticated can never write.
--
-- Also closes three RLS gaps of the exact same shape as the daily_briefs bug
-- fixed in 124 -- a Pro paywall enforced only in the API route, with the
-- underlying table readable via a direct PostgREST call:
--   * academy_lessons / academy_course_quizzes: requires_pro was never
--     checked in RLS, only in app/api/academy/courses/[slug]/route.ts.
--   * ai_stock_picks: thesis/risks/metrics_snapshot are documented Pro-tier
--     columns but the SELECT policy is USING (true).

-- ---------------------------------------------------------------------------
-- Fix A: referral replay guard on a column authenticated cannot write
-- ---------------------------------------------------------------------------

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS referral_reward_claimed_at TIMESTAMPTZ;
COMMENT ON COLUMN public.users.referral_reward_claimed_at IS
  'Set once by grant_share_referral_reward() as its replay guard. Never granted to authenticated -- unlike settings, a user cannot clear this to re-claim the referral bonus.';

CREATE OR REPLACE FUNCTION public.grant_share_referral_reward(share_id_param TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  referrer_id UUID;
  already_claimed BOOLEAN;
BEGIN
  IF caller_id IS NULL THEN
    RETURN;
  END IF;

  SELECT (referral_reward_claimed_at IS NOT NULL) INTO already_claimed
  FROM public.users
  WHERE id = caller_id
  FOR UPDATE;

  IF already_claimed THEN
    RETURN;
  END IF;

  UPDATE public.portfolio_shares
  SET signup_count = signup_count + 1
  WHERE id = share_id_param
  RETURNING user_id INTO referrer_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.users
  SET
    referral_reward_claimed_at = NOW(),
    settings = settings || jsonb_build_object('acquired_via_share_id', share_id_param),
    pro_bonus_until = GREATEST(pro_bonus_until, NOW()) + INTERVAL '1 month'
  WHERE id = caller_id;

  INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id, severity)
  VALUES (
    caller_id,
    'referral',
    'Your first month of Pro is on us',
    'You signed up from a shared BullPen card, so we added a free month of Pro to your account.',
    'user',
    caller_id::text,
    'info'
  );

  IF referrer_id IS NOT NULL AND referrer_id <> caller_id THEN
    UPDATE public.users
    SET pro_bonus_until = GREATEST(pro_bonus_until, NOW()) + INTERVAL '1 month'
    WHERE id = referrer_id;

    INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id, severity)
    VALUES (
      referrer_id,
      'referral',
      'You earned a free month of Pro',
      'Someone signed up from your shared portfolio card. We added a bonus month to your account.',
      'user',
      caller_id::text,
      'info'
    );
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Fix B: academy_lessons / academy_course_quizzes RLS -- gate by requires_pro
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users can read academy lessons" ON academy_lessons;
CREATE POLICY "Authenticated users can read academy lessons"
  ON academy_lessons FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM academy_courses c
      WHERE c.id = academy_lessons.course_id
        AND c.is_published = TRUE
        AND (
          c.requires_pro = FALSE
          OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
              AND (
                u.role = 'admin'
                OR u.account_tier >= 3
                OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > NOW())
              )
          )
        )
    )
  );

DROP POLICY IF EXISTS "Authenticated users can read course quizzes" ON academy_course_quizzes;
CREATE POLICY "Authenticated users can read course quizzes"
  ON academy_course_quizzes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM academy_courses c
      WHERE c.id = academy_course_quizzes.course_id
        AND c.is_published = TRUE
        AND (
          c.requires_pro = FALSE
          OR EXISTS (
            SELECT 1 FROM public.users u
            WHERE u.id = auth.uid()
              AND (
                u.role = 'admin'
                OR u.account_tier >= 3
                OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > NOW())
              )
          )
        )
    )
  );

-- academy_user_lesson_progress: block a free user from self-inserting/
-- upserting a "completed" row against a Pro-locked lesson (can't fabricate
-- progress on content they can't legitimately read after fix B above).
DROP POLICY IF EXISTS "Users can insert own lesson progress" ON academy_user_lesson_progress;
CREATE POLICY "Users can insert own lesson progress"
  ON academy_user_lesson_progress FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND (
      NOT EXISTS (
        SELECT 1 FROM academy_lessons l
        JOIN academy_courses c ON c.id = l.course_id
        WHERE l.id = academy_user_lesson_progress.lesson_id AND c.requires_pro = TRUE
      )
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND (u.role = 'admin' OR u.account_tier >= 3 OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > NOW()))
      )
    )
  );

DROP POLICY IF EXISTS "Users can update own lesson progress" ON academy_user_lesson_progress;
CREATE POLICY "Users can update own lesson progress"
  ON academy_user_lesson_progress FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND (
      NOT EXISTS (
        SELECT 1 FROM academy_lessons l
        JOIN academy_courses c ON c.id = l.course_id
        WHERE l.id = academy_user_lesson_progress.lesson_id AND c.requires_pro = TRUE
      )
      OR EXISTS (
        SELECT 1 FROM public.users u
        WHERE u.id = auth.uid()
          AND (u.role = 'admin' OR u.account_tier >= 3 OR (u.pro_bonus_until IS NOT NULL AND u.pro_bonus_until > NOW()))
      )
    )
  );

-- ---------------------------------------------------------------------------
-- Fix C: ai_stock_picks -- revoke direct column access to Pro-tier fields.
-- Column-level (not RLS) because the gate is per-caller tier, not per-row;
-- every legitimate read already goes through the API route's service-role
-- client (lib/picks/picks-db.ts), which bypasses column grants entirely.
-- ---------------------------------------------------------------------------

REVOKE SELECT (thesis, risks, metrics_snapshot) ON public.ai_stock_picks FROM authenticated;
