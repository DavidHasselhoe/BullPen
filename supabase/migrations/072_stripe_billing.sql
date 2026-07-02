-- 072_stripe_billing.sql
-- Link Supabase users to their Stripe customer/subscription so the billing
-- webhook can flip account_tier (1 = free, 3 = pro) on subscription changes.

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_customer_id     TEXT,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS stripe_status          TEXT;

-- Fast lookup from a webhook payload (which carries the Stripe customer id)
-- back to the owning user row.
CREATE UNIQUE INDEX IF NOT EXISTS users_stripe_customer_id_idx
  ON users (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS users_stripe_subscription_id_idx
  ON users (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;
