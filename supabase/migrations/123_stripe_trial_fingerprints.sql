-- 123_stripe_trial_fingerprints.sql
-- Free-trial abuse: nothing stopped one person from creating several BullPen
-- accounts (different emails) and getting a fresh 14-day Pro trial on each.
-- Email/IP are trivially spoofed; the card is not. This table remembers
-- which card (Stripe's payment method fingerprint) has already claimed a
-- trial, so the webhook (app/api/billing/webhook/route.ts) can collapse a
-- second trial on the same card to $0 days instead of granting another 14.
--
-- Same shape as security_events: RLS enabled, zero policies, service-role
-- client only (the webhook is the sole writer).
CREATE TABLE public.stripe_trial_fingerprints (
  fingerprint     TEXT PRIMARY KEY, -- Stripe payment_method.card.fingerprint
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  customer_id     TEXT NOT NULL,
  subscription_id TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.stripe_trial_fingerprints ENABLE ROW LEVEL SECURITY;
-- No policies — service-role client only.
