-- Brokerage connections via SnapTrade
-- Stores SnapTrade user credentials and connected account metadata.
-- userSecret is sensitive — stored server-side, never returned to the browser.

-- =====================================================
-- SNAPTRADE_USERS: server-side credential store
-- =====================================================
CREATE TABLE IF NOT EXISTS public.snaptrade_users (
  user_id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  snaptrade_user_id TEXT NOT NULL UNIQUE,
  user_secret       TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.snaptrade_users ENABLE ROW LEVEL SECURITY;
-- Intentionally NO read policy — only the service role (backend) may access credentials.

-- =====================================================
-- BROKERAGE_CONNECTIONS: connected accounts metadata
-- =====================================================
CREATE TABLE IF NOT EXISTS public.brokerage_connections (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snaptrade_account_id TEXT NOT NULL,
  authorization_id     TEXT,           -- SnapTrade brokerage authorization ID
  account_name         TEXT,
  brokerage_name       TEXT,
  brokerage_slug       TEXT,
  account_number       TEXT,           -- Masked, e.g. "****1234"
  account_type         TEXT,
  is_active            BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at       TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, snaptrade_account_id)
);

ALTER TABLE public.brokerage_connections ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public'
      AND tablename = 'brokerage_connections'
      AND policyname = 'Users can read own brokerage connections'
  ) THEN
    CREATE POLICY "Users can read own brokerage connections"
      ON public.brokerage_connections FOR SELECT
      USING (auth.uid() = user_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_brokerage_connections_user_id
  ON public.brokerage_connections (user_id);

-- =====================================================
-- USER_HOLDINGS: add source + brokerage tracking columns
-- =====================================================
ALTER TABLE public.user_holdings
  ADD COLUMN IF NOT EXISTS source             TEXT NOT NULL DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS brokerage_account_id TEXT;

COMMENT ON COLUMN public.user_holdings.source IS
  'Origin of the holding: "manual" (user-entered) or "snaptrade" (broker-synced)';

COMMENT ON COLUMN public.user_holdings.brokerage_account_id IS
  'SnapTrade account ID when source = ''snaptrade''; null for manual holdings';

CREATE INDEX IF NOT EXISTS idx_user_holdings_source
  ON public.user_holdings (source);
