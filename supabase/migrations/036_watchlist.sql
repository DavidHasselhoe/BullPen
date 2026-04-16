-- User Watchlist
-- Stores user's watched stocks (no qty/price — separate from holdings)

CREATE TABLE IF NOT EXISTS public.user_watchlist (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol       TEXT NOT NULL,
  company_name TEXT NOT NULL,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, symbol)
);

ALTER TABLE public.user_watchlist ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_watchlist'
      AND policyname = 'Users manage own watchlist'
  ) THEN
    CREATE POLICY "Users manage own watchlist"
      ON public.user_watchlist
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON public.user_watchlist (user_id);
