-- Public User Profiles Migration
-- Enables browsing other users' public profiles and portfolio stock lists.
-- Email, settings, role, and financial data (qty/price) are NEVER exposed — enforced at the API layer.

-- =====================================================
-- USERS: Allow authenticated users to read public profiles
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'users'
      AND policyname = 'Authenticated users can view public profiles'
  ) THEN
    CREATE POLICY "Authenticated users can view public profiles"
      ON public.users
      FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- =====================================================
-- USER_HOLDINGS: Allow authenticated users to view others' holdings
-- =====================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'user_holdings'
      AND policyname = 'Authenticated users can view public holdings'
  ) THEN
    CREATE POLICY "Authenticated users can view public holdings"
      ON public.user_holdings
      FOR SELECT
      USING (auth.uid() IS NOT NULL);
  END IF;
END $$;

-- =====================================================
-- PERFORMANCE: Index for user search by username / full_name
-- =====================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_users_username_trgm
  ON public.users USING gin (username gin_trgm_ops)
  WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_full_name_trgm
  ON public.users USING gin (full_name gin_trgm_ops)
  WHERE full_name IS NOT NULL;
