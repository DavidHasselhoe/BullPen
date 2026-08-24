-- 115_referral_reward_notifications.sql
-- Extends grant_share_referral_reward() (114_referral_rewards.sql) to also
-- notify both sides when a reward lands — otherwise the bonus month is
-- invisible until someone happens to notice Pro features unlocked.
-- notifications has no INSERT RLS policy for `authenticated` at all (see
-- 018_notifications.sql: "inserts must be done via server actions with
-- service role") — safe from this SECURITY DEFINER function for the same
-- reason the UPDATE on public.users in 114 is: it runs as the function's
-- owner, not the caller, so RLS doesn't apply to it.

CREATE OR REPLACE FUNCTION public.grant_share_referral_reward(share_id TEXT, new_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  referrer_id UUID;
BEGIN
  UPDATE public.portfolio_shares
  SET signup_count = signup_count + 1
  WHERE id = share_id
  RETURNING user_id INTO referrer_id;

  UPDATE public.users
  SET pro_bonus_until = GREATEST(pro_bonus_until, NOW()) + INTERVAL '1 month'
  WHERE id = new_user_id;

  INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id, severity)
  VALUES (
    new_user_id,
    'referral',
    'Your first month of Pro is on us',
    'You signed up from a shared BullPen card, so we added a free month of Pro to your account.',
    'user',
    new_user_id::text,
    'info'
  );

  IF referrer_id IS NOT NULL AND referrer_id <> new_user_id THEN
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
      new_user_id::text,
      'info'
    );
  END IF;
END;
$$;
