-- Separate admin privilege from billing tier.
--
-- Until now `users.account_tier = 2` was repurposed as "admin/staff" — but
-- conflating role with billing ladder is fragile (someone could accidentally
-- get tier=2 from any flow). This migration:
--   1. Locks the `role` column to known values via CHECK constraint
--   2. Replaces the ai_usage admin-read RLS policy to check role='admin' instead
--      of account_tier >= 2
--
-- Billing semantics after this:
--   account_tier 1 = free, 3 = paid Pro  (tier 2 is no longer used by any code path)
--   role 'admin'   = internal/staff dashboard access (orthogonal to billing tier)

-- Constrain role values so accidental writes can't grant admin
ALTER TABLE users
  ADD CONSTRAINT users_role_check
  CHECK (role IN ('user', 'admin'));

-- Drop the old admin-read policy on ai_usage (was tier-based)
DROP POLICY IF EXISTS "Admins read all ai_usage" ON ai_usage;

-- Recreate it as role-based
CREATE POLICY "Admins read all ai_usage"
  ON ai_usage FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
        AND users.role = 'admin'
    )
  );
