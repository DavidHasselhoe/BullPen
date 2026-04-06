-- Social Layer: Follows + Stock Theses

-- =====================================================
-- user_follows: who follows whom
-- =====================================================
CREATE TABLE public.user_follows (
  follower_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, following_id),
  CONSTRAINT no_self_follow CHECK (follower_id <> following_id)
);

ALTER TABLE public.user_follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own follows"
  ON public.user_follows
  USING (auth.uid() = follower_id)
  WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Follows are readable by authenticated users"
  ON public.user_follows FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE INDEX idx_follows_follower  ON public.user_follows (follower_id);
CREATE INDEX idx_follows_following ON public.user_follows (following_id);

-- =====================================================
-- stock_theses: short bull/bear/neutral takes on stocks
-- =====================================================
CREATE TABLE public.stock_theses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  symbol      TEXT NOT NULL,
  content     TEXT NOT NULL CHECK (char_length(content) BETWEEN 1 AND 500),
  sentiment   TEXT NOT NULL CHECK (sentiment IN ('bull','bear','neutral')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.stock_theses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authors manage own theses"
  ON public.stock_theses
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Theses readable by authenticated users"
  ON public.stock_theses FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE INDEX idx_theses_symbol   ON public.stock_theses (symbol, created_at DESC);
CREATE INDEX idx_theses_user_id  ON public.stock_theses (user_id);
