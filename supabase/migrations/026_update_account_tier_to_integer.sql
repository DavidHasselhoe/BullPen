-- Update account_tier from TEXT to INTEGER
-- Change from text values ('free', 'premium', 'enterprise') to numeric tiers (1, 2, 3)
-- Tier 1-2 = Normal (free), Tier 3 = Gold (subscriber)

BEGIN;

-- Drop the existing constraint
ALTER TABLE public.users
DROP CONSTRAINT IF EXISTS users_account_tier_check;

-- Drop the default value first (required before type conversion)
ALTER TABLE public.users
ALTER COLUMN account_tier DROP DEFAULT;

-- Convert existing text values to integers
-- 'free' -> 1 (Normal)
-- 'premium' or 'enterprise' -> 3 (Gold)
UPDATE public.users
SET account_tier = CASE
  WHEN account_tier = 'free' THEN '1'
  WHEN account_tier IN ('premium', 'enterprise') THEN '3'
  ELSE '1' -- Default to Normal for any other values
END::TEXT;

-- Change column type from TEXT to INTEGER
ALTER TABLE public.users
ALTER COLUMN account_tier TYPE INTEGER USING account_tier::INTEGER;

-- Add new constraint: only allow 1, 2, or 3
ALTER TABLE public.users
ADD CONSTRAINT users_account_tier_check
CHECK (account_tier IN (1, 2, 3));

-- Set default to 1 (Normal)
ALTER TABLE public.users
ALTER COLUMN account_tier SET DEFAULT 1;

-- Update comment
COMMENT ON COLUMN public.users.account_tier IS 'Account tier: 1-2 = Normal (free), 3 = Gold (subscriber)';

COMMIT;
