-- User Profile & Settings Migration
-- Adds profile and settings fields to public.users table

-- =====================================================
-- PROFILE FIELDS
-- =====================================================

-- Add profile fields to users table
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS bio TEXT,
  ADD COLUMN IF NOT EXISTS experience_level TEXT CHECK (experience_level IN ('beginner', 'intermediate', 'advanced')),
  ADD COLUMN IF NOT EXISTS market_focus TEXT CHECK (market_focus IN ('US', 'EU', 'BOTH')),
  ADD COLUMN IF NOT EXISTS risk_profile TEXT CHECK (risk_profile IN ('conservative', 'balanced', 'aggressive')),
  ADD COLUMN IF NOT EXISTS account_tier TEXT NOT NULL DEFAULT 'guest' CHECK (account_tier IN ('guest', 'registered', 'premium', 'enterprise'));

-- =====================================================
-- SETTINGS FIELDS (stored as JSONB for flexibility)
-- =====================================================

-- Add settings JSONB column
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS settings JSONB DEFAULT '{}'::jsonb;

-- Add comment
COMMENT ON COLUMN public.users.settings IS 'User preferences: default_market, default_currency, theme, notifications, etc.';

-- Create index on settings for common queries
CREATE INDEX IF NOT EXISTS idx_users_settings ON public.users USING GIN (settings);

-- Add comments for new columns
COMMENT ON COLUMN public.users.bio IS 'User bio/short description';
COMMENT ON COLUMN public.users.experience_level IS 'User experience level: beginner, intermediate, advanced';
COMMENT ON COLUMN public.users.market_focus IS 'Primary market focus: US, EU, or BOTH';
COMMENT ON COLUMN public.users.risk_profile IS 'User risk tolerance: conservative, balanced, aggressive';
COMMENT ON COLUMN public.users.account_tier IS 'Account tier: guest, registered, premium, enterprise';
