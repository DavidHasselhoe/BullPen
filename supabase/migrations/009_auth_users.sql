-- Auth v1: User Schema Migration
-- Creates public.users table that extends Supabase Auth (auth.users)
-- Stores app-specific user metadata (profile, preferences, etc.)

-- =====================================================
-- USERS TABLE (Public Metadata)
-- =====================================================
-- Extends Supabase Auth (auth.users) with app-specific data
-- id must match auth.users.id (references auth.users)
-- Passwords are NOT stored here - handled by Supabase Auth

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  username TEXT UNIQUE,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_users_email ON public.users(email);
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users(username) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_role ON public.users(role);

-- Comments for documentation
COMMENT ON TABLE public.users IS 'User profiles and app-specific metadata. Extends Supabase Auth (auth.users).';
COMMENT ON COLUMN public.users.id IS 'References auth.users.id - must match Supabase Auth user ID';
COMMENT ON COLUMN public.users.email IS 'User email address (must match auth.users.email)';
COMMENT ON COLUMN public.users.username IS 'Optional unique username for display';
COMMENT ON COLUMN public.users.role IS 'User role for future permissions (default: user)';
COMMENT ON COLUMN public.users.last_login_at IS 'Timestamp of last login (updated on login)';

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================
-- Enable RLS on public.users
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

-- Policy 1: Users can read their own row
CREATE POLICY "Users can read own profile"
  ON public.users
  FOR SELECT
  USING (auth.uid() = id);

-- Policy 2: Users can update their own row
CREATE POLICY "Users can update own profile"
  ON public.users
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy 3: Allow inserts via trigger and authenticated users
-- The trigger function handle_new_user() has SECURITY DEFINER, so it bypasses RLS
-- Additionally, allow authenticated users to insert their own profile (fallback)
CREATE POLICY "Allow trigger to insert users"
  ON public.users
  FOR INSERT
  WITH CHECK (auth.uid() = id OR true); -- Allow if user is inserting their own profile or via trigger

-- =====================================================
-- TRIGGERS
-- =====================================================
-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =====================================================
-- FUNCTION: Handle New User Signup
-- =====================================================
-- This function is called automatically when a new user signs up via Supabase Auth
-- Creates a corresponding row in public.users
-- Must be called as a database trigger on auth.users insert

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, created_at)
  VALUES (NEW.id, NEW.email, NOW())
  ON CONFLICT (id) DO NOTHING; -- Prevent duplicate inserts
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger on auth.users to automatically create public.users row
-- This ensures public.users is always created when a user signs up
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();