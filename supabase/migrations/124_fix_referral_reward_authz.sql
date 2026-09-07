-- 124_fix_referral_reward_authz.sql
-- Fixes two issues found in a security audit (2026-09-07):
--
-- 1. grant_share_referral_reward accepted new_user_id as a plain parameter
--    instead of deriving it from auth.uid(), and had no server-side replay
--    guard -- the only "already claimed" check lived in client-side TS
--    (lib/auth/share-attribution.ts), trivially bypassed by calling
--    supabase.rpc() directly. That allowed unlimited self-granted
--    pro_bonus_until stacking (permanent free Pro, zero Stripe involvement).
--
-- 2. daily_briefs RLS was USING (true) for all authenticated users, so the
--    Pro paywall (enforced only in the API route) could be bypassed via a
--    direct PostgREST query.

-- ---------------------------------------------------------------------------
-- Fix 1: referral reward RPC -- auth.uid() only, atomic replay guard,
-- require a real share row before rewarding.
-- ---------------------------------------------------------------------------

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

  -- Atomic claim: lock the caller's row and bail if this account already
  -- recorded a share attribution, so replaying the call can't stack rewards.
  SELECT (settings ? 'acquired_via_share_id') INTO already_claimed
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

  -- Only a real share link earns a reward, not an arbitrary/garbage id.
  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.users
  SET
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

-- Old (share_id, new_user_id) signature is superseded; drop it so the
-- vulnerable version can no longer be called.
DROP FUNCTION IF EXISTS public.grant_share_referral_reward(TEXT, UUID);

-- ---------------------------------------------------------------------------
-- Fix 2: daily_briefs RLS -- enforce the Pro/admin paywall at the DB layer,
-- matching lib/billing/tier.ts's tierFromUser() logic exactly.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Authenticated users can read daily briefs" ON daily_briefs;

CREATE POLICY "Pro and admin users can read daily briefs"
  ON daily_briefs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE id = auth.uid()
        AND (
          role = 'admin'
          OR account_tier >= 3
          OR (pro_bonus_until IS NOT NULL AND pro_bonus_until > NOW())
        )
    )
  );
