-- 099_stripe_webhook_event_ordering.sql
-- Guards the billing webhook against applying an out-of-order or redelivered
-- Stripe event over newer already-applied state. Stores the `created` (unix
-- seconds, converted to timestamptz) of the most recently APPLIED billing
-- event per user; the webhook handler skips any incoming event whose
-- `created` is strictly older than this value.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS stripe_last_event_at TIMESTAMPTZ;
