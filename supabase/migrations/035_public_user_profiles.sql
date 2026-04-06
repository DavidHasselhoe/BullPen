-- Public User Profiles Migration
-- Enables browsing other users' public profiles and portfolio stock lists.
-- Email, settings, role, and financial data (qty/price) are NEVER exposed — enforced at the API layer.

-- =====================================================
-- USERS: Allow authenticated users to read public profiles
-- =====================================================
-- Previously only "Users can read own profile" existed (auth.uid() = id).
-- This new policy lets any signed-in user read any row in public.users.
-- The API routes are responsible for returning only safe columns:
--   id, username, full_name, avatar_url, bio, experience_level,
--   market_focus, risk_profile, account_tier, created_at
-- Sensitive columns (email, settings, role, last_login_at) are never selected by the API.
CREATE POLICY "Authenticated users can view public profiles"
  ON public.users
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- =====================================================
-- USER_HOLDINGS: Allow authenticated users to view others' holdings
-- =====================================================
-- Allows any signed-in user to read user_holdings rows.
-- The API routes only return symbol + company_name (no quantity or avg_price).
CREATE POLICY "Authenticated users can view public holdings"
  ON public.user_holdings
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- =====================================================
-- PERFORMANCE: Index for user search by username / full_name
-- =====================================================
-- pg_trgm-based indexes let ILIKE queries run efficiently.
-- Requires the pg_trgm extension (enabled by default in Supabase).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_users_username_trgm
  ON public.users USING gin (username gin_trgm_ops)
  WHERE username IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_full_name_trgm
  ON public.users USING gin (full_name gin_trgm_ops)
  WHERE full_name IS NOT NULL;

-- =====================================================
-- PRIVACY: Add profile_public flag to settings JSONB (handled at app layer)
-- =====================================================
-- The privacy toggle is stored in the existing settings JSONB column as:
--   settings->>'profile_public' = 'true' | 'false'
-- Default (absent key) is treated as public = true.
-- No schema change required; documented here for reference.

COMMENT ON POLICY "Authenticated users can view public profiles" ON public.users
  IS 'Any authenticated user can read the users table; API layer filters columns and respects profile_public setting.';

COMMENT ON POLICY "Authenticated users can view public holdings"  ON public.user_holdings
  IS 'Any authenticated user can read holdings rows; API layer returns symbol + company_name only.';
