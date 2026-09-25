-- ---------------------------------------------------------------------------
-- Following a tracked politician (Washington Trading).
--
-- Same shape as user_institution_follows (migration 133): a plain
-- user -> target join, natural key unique so following twice is a no-op.
-- The refresh cron fans out a notification to these users when it stores new
-- disclosed trades for the member.
--
-- Not Pro-gated: the disclosures themselves are deliberately public (see the
-- 5 U.S.C. 13107 note in migration 149), and so is being told a new one landed.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_politician_follows (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  politician_id UUID        NOT NULL REFERENCES public.congress_politicians(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, politician_id)
);

CREATE INDEX IF NOT EXISTS idx_politician_follows_user       ON public.user_politician_follows (user_id);
CREATE INDEX IF NOT EXISTS idx_politician_follows_politician ON public.user_politician_follows (politician_id);

ALTER TABLE public.user_politician_follows ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_politician_follows'
      AND policyname = 'Users manage own politician follows'
  ) THEN
    CREATE POLICY "Users manage own politician follows"
      ON public.user_politician_follows
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
