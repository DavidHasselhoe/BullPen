-- Referrals no longer hand out free Pro at signup.
--
-- Before this, record_referral (migration 173) added a month of pro_bonus_until
-- to every new account that came through an invite or share link. Email
-- confirmation is off and no card was involved, so one link could mint a free
-- month for every throwaway account, forever: the referrer caps never limited
-- the new user's side.
--
-- Now:
--   * signing up through a link only records the referral. The new user's
--     Pro trial at checkout is 30 days instead of 7 (app/api/billing/checkout,
--     lib/billing/referral-trial.ts). Checkout needs a verified email and a
--     card, and the card fingerprint guard (migration 123) stops one card
--     starting a second trial.
--   * the referrer earns their free month when that trial starts and survives
--     the fingerprint guard (claim_referral_trial, called by the Stripe
--     webhook). The 3 per 30 days and 12 total caps now count reward time.

ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ;

CREATE OR REPLACE FUNCTION public.record_referral(caller_id UUID, referrer UUID, kind TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_created TIMESTAMPTZ;
  already BOOLEAN;
BEGIN
  SELECT created_at, (settings ? 'acquired_via_share_id') INTO caller_created, already
  FROM public.users WHERE id = caller_id FOR UPDATE;

  IF caller_created IS NULL OR already OR caller_created < now() - INTERVAL '24 hours' THEN
    RETURN false;
  END IF;
  IF referrer IS NOT NULL AND referrer = caller_id THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM public.referrals WHERE referred_id = caller_id) THEN
    RETURN false;
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_id, source, referrer_rewarded)
  VALUES (referrer, caller_id, kind, false);

  INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id, severity)
  VALUES (caller_id, 'referral', 'Your Pro trial is 30 days',
    'You joined through a friend''s link, so your free Pro trial lasts 30 days instead of 7.',
    'user', caller_id::text, 'info');

  IF referrer IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id, severity)
    VALUES (referrer, 'referral', 'Someone joined through your link',
      'You get a free month of Pro when they start their free trial.',
      'user', caller_id::text, 'info');
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_referral(UUID, UUID, TEXT) FROM public, anon, authenticated;

-- Called by the Stripe webhook once a referred user's trial has started and
-- passed the card fingerprint guard. Runs once per referral: the
-- trial_started_at claim is atomic, so a redelivered webhook does nothing.
CREATE OR REPLACE FUNCTION public.claim_referral_trial(referred UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ref_id UUID;
  referrer UUID;
  recent INT;
  total INT;
  rewarded BOOLEAN;
BEGIN
  UPDATE public.referrals
  SET trial_started_at = now()
  WHERE referred_id = referred AND trial_started_at IS NULL
  RETURNING id, referrer_id INTO ref_id, referrer;

  IF ref_id IS NULL OR referrer IS NULL THEN RETURN; END IF;

  -- Serialise rewards per referrer so two trials starting at once can't both
  -- slip under the cap.
  PERFORM 1 FROM public.users WHERE id = referrer FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT count(*) FILTER (WHERE trial_started_at > now() - INTERVAL '30 days'), count(*)
    INTO recent, total
  FROM public.referrals
  WHERE referrer_id = referrer AND referrer_rewarded;
  rewarded := recent < 3 AND total < 12;

  IF rewarded THEN
    UPDATE public.referrals SET referrer_rewarded = true WHERE id = ref_id;
    UPDATE public.users
    SET pro_bonus_until = GREATEST(pro_bonus_until, now()) + INTERVAL '1 month'
    WHERE id = referrer;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id, severity)
  VALUES (referrer, 'referral',
    CASE WHEN rewarded THEN 'You earned a free month of Pro' ELSE 'A friend started their trial' END,
    CASE WHEN rewarded
      THEN 'A friend you invited started their Pro trial. We added a month of Pro to your account.'
      ELSE 'A friend you invited started their Pro trial. You have reached the limit of free months for now, so this one is not counted.'
    END,
    'user', referred::text, 'info');
END;
$$;

REVOKE ALL ON FUNCTION public.claim_referral_trial(UUID) FROM public, anon, authenticated;
