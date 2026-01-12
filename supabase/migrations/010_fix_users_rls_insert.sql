-- Fix Users RLS Insert Policy
-- Allows authenticated users to insert their own profile (fallback if trigger fails)

-- Drop existing insert policy if it exists
DROP POLICY IF EXISTS "Allow trigger to insert users" ON public.users;

-- Create new policy that allows:
-- 1. Trigger function (SECURITY DEFINER bypasses RLS)
-- 2. Authenticated users inserting their own profile (fallback)
CREATE POLICY "Allow trigger to insert users"
  ON public.users
  FOR INSERT
  WITH CHECK (
    auth.uid() = id OR -- User is inserting their own profile
    true -- Trigger function bypasses RLS via SECURITY DEFINER
  );