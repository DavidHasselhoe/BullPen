-- Fix Account Tier: Change 'guest' to 'free'
-- Guest means not logged in, tier is for subscription levels
-- All logged-in users should have a tier (free by default)

-- Drop the existing constraint FIRST (before updating values)
DO $$
DECLARE
    constraint_name TEXT;
BEGIN
    -- Find the constraint name for account_tier on users table
    SELECT conname INTO constraint_name
    FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass
    AND contype = 'c'  -- check constraint
    AND conname LIKE '%account_tier%';
    
    IF constraint_name IS NOT NULL THEN
        EXECUTE format('ALTER TABLE public.users DROP CONSTRAINT %I', constraint_name);
    END IF;
END $$;

-- Now update existing values (constraint is dropped, so this will work)
UPDATE public.users
SET account_tier = 'free'
WHERE account_tier = 'guest';

UPDATE public.users
SET account_tier = 'free'
WHERE account_tier = 'registered';

-- Add new constraint with correct values: free, premium, enterprise
ALTER TABLE public.users
ADD CONSTRAINT users_account_tier_check 
CHECK (account_tier IN ('free', 'premium', 'enterprise'));

-- Update the default value
ALTER TABLE public.users
ALTER COLUMN account_tier SET DEFAULT 'free';

-- Update the comment
COMMENT ON COLUMN public.users.account_tier IS 'Subscription tier: free (default), premium, enterprise';
