-- Personal invite links: bullpeninvest.com/invite/<code>, a free month of Pro
-- for both people, the same reward a shared portfolio card already gives.
--
-- The share reward (migration 124) had two gaps that a link on every account
-- would turn into free Pro for anyone: an account of any age could claim once,
-- and the referrer's reward had no limit, so throwaway signups through your
-- own link (email confirmation is off) stacked months forever. Both rewards
-- now share these rules:
--   * only an account created in the last 24 hours can claim, once, through
--     either kind of link (referrals.referred_id is unique);
--   * nobody refers themselves;
--   * a referrer earns at most 3 months per 30 days and 12 in total. Past the
--     cap the referral is still recorded and the new user still gets a month.

-- 1. A stable code per account. 10 hex characters: about 1e12 values, so a
--    collision at signup is not a practical risk, and the unique index would
--    reject one rather than hand two people the same link. Not in the
--    authenticated column grants (migration 121), so only the server reads it.
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS invite_code TEXT
  DEFAULT lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

UPDATE public.users
SET invite_code = lower(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))
WHERE invite_code IS NULL;

ALTER TABLE public.users ALTER COLUMN invite_code SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS users_invite_code_key ON public.users (invite_code);

-- 2. One row per referred account, whichever link brought them.
CREATE TABLE IF NOT EXISTS public.referrals (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  referred_id      UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  source           TEXT NOT NULL CHECK (source IN ('invite', 'share')),
  referrer_rewarded BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS referrals_referrer_idx ON public.referrals (referrer_id, created_at);

-- Server-only: the app reads it through the service role (/api/invite).
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- 3. The shared rules, called by both claim functions. Returns false when the
--    caller cannot claim; the caller row is locked for the transaction.
CREATE OR REPLACE FUNCTION public.record_referral(caller_id UUID, referrer UUID, kind TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_created TIMESTAMPTZ;
  already BOOLEAN;
  recent INT;
  total INT;
  rewarded BOOLEAN := false;
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

  IF referrer IS NOT NULL THEN
    SELECT count(*) FILTER (WHERE created_at > now() - INTERVAL '30 days'), count(*)
      INTO recent, total
    FROM public.referrals
    WHERE referrer_id = referrer AND referrer_rewarded;
    rewarded := recent < 3 AND total < 12;
  END IF;

  INSERT INTO public.referrals (referrer_id, referred_id, source, referrer_rewarded)
  VALUES (referrer, caller_id, kind, rewarded);

  UPDATE public.users
  SET pro_bonus_until = GREATEST(pro_bonus_until, now()) + INTERVAL '1 month'
  WHERE id = caller_id;

  INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id, severity)
  VALUES (caller_id, 'referral', 'Your first month of Pro is on us',
    'You joined through a friend''s link, so we added a free month of Pro to your account.',
    'user', caller_id::text, 'info');

  IF referrer IS NOT NULL THEN
    IF rewarded THEN
      UPDATE public.users
      SET pro_bonus_until = GREATEST(pro_bonus_until, now()) + INTERVAL '1 month'
      WHERE id = referrer;
    END IF;
    INSERT INTO public.notifications (user_id, type, title, message, entity_type, entity_id, severity)
    VALUES (referrer, 'referral',
      CASE WHEN rewarded THEN 'You earned a free month of Pro' ELSE 'Someone joined through your link' END,
      CASE WHEN rewarded
        THEN 'Someone signed up through your link. We added a month of Pro to your account.'
        ELSE 'Someone signed up through your link. You have reached the limit of free months for now, so this one is not counted.'
      END,
      'user', caller_id::text, 'info');
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.record_referral(UUID, UUID, TEXT) FROM public, anon, authenticated;

-- 4. Invite links.
CREATE OR REPLACE FUNCTION public.grant_invite_referral_reward(invite_code_param TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  referrer UUID;
BEGIN
  IF caller_id IS NULL THEN RETURN; END IF;
  SELECT id INTO referrer FROM public.users WHERE invite_code = lower(invite_code_param);
  IF referrer IS NULL THEN RETURN; END IF; -- only a real code earns anything
  PERFORM public.record_referral(caller_id, referrer, 'invite');
END;
$$;

REVOKE ALL ON FUNCTION public.grant_invite_referral_reward(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.grant_invite_referral_reward(TEXT) TO authenticated;

-- 5. Shared portfolio cards: same signature as migration 124, so the code on
--    main keeps working, now under the same rules.
CREATE OR REPLACE FUNCTION public.grant_share_referral_reward(share_id_param TEXT)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_id UUID := auth.uid();
  referrer UUID;
BEGIN
  IF caller_id IS NULL THEN RETURN; END IF;
  SELECT user_id INTO referrer FROM public.portfolio_shares WHERE id = share_id_param;
  IF NOT FOUND THEN RETURN; END IF;

  IF public.record_referral(caller_id, referrer, 'share') THEN
    UPDATE public.portfolio_shares SET signup_count = signup_count + 1 WHERE id = share_id_param;
    UPDATE public.users
    SET settings = settings || jsonb_build_object('acquired_via_share_id', share_id_param)
    WHERE id = caller_id;
  END IF;
END;
$$;

-- Signed out, both functions do nothing (auth.uid() is null); grant them alike.
REVOKE ALL ON FUNCTION public.grant_share_referral_reward(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.grant_share_referral_reward(TEXT) TO authenticated;
