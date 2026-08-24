-- 114_referral_rewards.sql
-- Referral rewards layered onto the existing shareable-portfolio-card
-- attribution (migration 100, lib/auth/share-attribution.ts). That pass
-- deliberately shipped attribution-only, no rewards, per its own spec's
-- non-goals. This adds the "give a month, get a month" reward: when a new
-- signup is attributed to a share, both the new user AND the share's owner
-- (the referrer) get one month of bonus Pro access, stacking per successful
-- referral.
--
-- pro_bonus_until is deliberately independent of account_tier, which is
-- fully owned by the Stripe webhook (app/api/billing/webhook/route.ts flips
-- it to 1 on any non-active/trialing subscription event) — writing this
-- reward directly into account_tier would get silently stomped by the next
-- webhook delivery for that user, or would collide with a real Pro
-- subscriber's actual billing state. Bonus Pro is checked as an OR
-- alongside account_tier in lib/billing/tier.ts instead.

ALTER TABLE public.users ADD COLUMN pro_bonus_until TIMESTAMPTZ;
COMMENT ON COLUMN public.users.pro_bonus_until IS
  'Temporary Pro access granted outside Stripe billing (referral rewards). Checked as an OR alongside account_tier in lib/billing/tier.ts — never touched by the Stripe webhook.';

-- Same self-privilege-escalation guard as account_tier/role/stripe_* in
-- migration 096: only the SECURITY DEFINER RPC below (or the service-role
-- client) may ever write this column. SECURITY DEFINER functions run as
-- their owner, not the caller, so this REVOKE doesn't block the RPC itself.
REVOKE UPDATE (pro_bonus_until) ON public.users FROM authenticated;

-- Supersedes increment_share_signup_count (100_portfolio_shares.sql): same
-- signup-count bump, plus the reward grant to both sides.
DROP FUNCTION IF EXISTS public.increment_share_signup_count(TEXT);

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

  -- The new signup is rewarded unconditionally — they arrived via a real
  -- share link, which is exactly what maybeClaimShareAttribution() already
  -- verified before calling this RPC.
  UPDATE public.users
  SET pro_bonus_until = GREATEST(pro_bonus_until, NOW()) + INTERVAL '1 month'
  WHERE id = new_user_id;

  -- The referrer earns their month too, unless the share is now orphaned
  -- (owner deleted their account — portfolio_shares.user_id is
  -- ON DELETE SET NULL) or this is a degenerate self-referral.
  IF referrer_id IS NOT NULL AND referrer_id <> new_user_id THEN
    UPDATE public.users
    SET pro_bonus_until = GREATEST(pro_bonus_until, NOW()) + INTERVAL '1 month'
    WHERE id = referrer_id;
  END IF;
END;
$$;
