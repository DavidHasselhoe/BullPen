-- 100_portfolio_shares.sql
-- Shareable portfolio-performance cards: an immutable snapshot of "today's"
-- gain, created when a user clicks Share. Never recomputed after insert —
-- the link should show the same thing next week that it showed today, the
-- same guarantee a screenshot gives.

CREATE TABLE public.portfolio_shares (
  id             TEXT PRIMARY KEY,
  user_id        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Snapshotted alongside pct/pnl_usd/sparkline, same reasoning: must survive
  -- the account being renamed OR deleted later without the card silently
  -- changing or breaking. NULL whenever `anonymous` is true (never captured).
  username       TEXT,
  date           DATE NOT NULL,
  pct            NUMERIC NOT NULL,
  pnl_usd        NUMERIC,
  currency       TEXT NOT NULL DEFAULT 'USD',
  sparkline      JSONB NOT NULL,
  anonymous      BOOLEAN NOT NULL DEFAULT FALSE,
  signup_count   INTEGER NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_portfolio_shares_user ON public.portfolio_shares (user_id, created_at DESC);

ALTER TABLE public.portfolio_shares ENABLE ROW LEVEL SECURITY;

-- Owners can create and browse their own share history. The public /share/[id]
-- page and OG image route do NOT go through these policies — they read via a
-- service-role client (lib/shares/get-share.ts), since a logged-out visitor
-- has no auth.uid() at all.
CREATE POLICY "Users create their own shares"
  ON public.portfolio_shares FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users view their own shares"
  ON public.portfolio_shares FOR SELECT
  USING (auth.uid() = user_id);

-- SECURITY DEFINER: a brand-new signup crediting a share is never that share's
-- owner, so this has to bypass the owner-only RLS above. Scoped to exactly one
-- counter on one row — no broader access than that.
CREATE OR REPLACE FUNCTION public.increment_share_signup_count(share_id TEXT)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.portfolio_shares SET signup_count = signup_count + 1 WHERE id = share_id;
$$;
