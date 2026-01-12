-- Fix Users RLS Insert Policy v2
-- More permissive policy to allow signup flow to work correctly

-- Drop existing insert policy
DROP POLICY IF EXISTS "Allow trigger to insert users" ON public.users;

-- Create a more permissive policy that allows:
-- 1. Trigger function (SECURITY DEFINER bypasses RLS - this happens automatically)
-- 2. Authenticated users inserting their own profile (by checking auth.uid() = id)
-- 3. Allow inserts if the id matches the authenticated user's ID (even during signup)
CREATE POLICY "Allow trigger to insert users"
  ON public.users
  FOR INSERT
  WITH CHECK (
    -- Allow if user is inserting their own profile (matches their auth.uid())
    -- This works because after signUp(), the session is established
    auth.uid() = id
  );

-- Note: The trigger function handle_new_user() has SECURITY DEFINER
-- which means it bypasses RLS automatically when it runs
-- This policy is for manual inserts as a fallback
