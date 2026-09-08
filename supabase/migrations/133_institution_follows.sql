-- ---------------------------------------------------------------------------
-- Following an institutional fund.
--
-- The 13F tracker knows when a fund's holdings change (the weekly sync
-- ingests a new filing roughly once a quarter per fund), but had no way for
-- a user to say they care about a particular fund. This is that edge, modelled
-- on user_watchlist (migration 036): a plain user -> target join with the
-- natural key uniquely constrained, so following twice is a no-op.
--
-- Deliberately NOT Pro-gated. The Discover cards are free teaser data and the
-- notification only says a fund filed and roughly what moved; opening the
-- fund's full holdings is where the Pro gate already sits.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_institution_follows (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  investor_id UUID        NOT NULL REFERENCES public.institutional_investors(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, investor_id)
);

-- Both directions are read in anger: the fund page asks "does this user follow
-- this fund", the sync fan-out asks "who follows this fund".
CREATE INDEX IF NOT EXISTS idx_institution_follows_user     ON public.user_institution_follows (user_id);
CREATE INDEX IF NOT EXISTS idx_institution_follows_investor ON public.user_institution_follows (investor_id);

ALTER TABLE public.user_institution_follows ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_institution_follows'
      AND policyname = 'Users manage own institution follows'
  ) THEN
    CREATE POLICY "Users manage own institution follows"
      ON public.user_institution_follows
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
