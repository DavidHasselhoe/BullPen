/**
 * Server-side Stripe client + config helpers.
 *
 * All billing routes go through here so that:
 *  - the SDK is instantiated once (singleton),
 *  - we degrade gracefully when Stripe env vars aren't set yet (the checkout
 *    route falls back to the "waitlist" stub), and
 *  - price IDs live in one place, keyed by billing cycle.
 *
 * Required env (server-only — never expose the secret key client-side):
 *   STRIPE_SECRET_KEY          sk_test_… / sk_live_…
 *   STRIPE_PRICE_PRO_MONTHLY   price_… ($12/mo)
 *   STRIPE_PRICE_PRO_ANNUAL    price_… ($108/yr)
 *   STRIPE_WEBHOOK_SECRET      whsec_…  (webhook route only)
 */

import Stripe from 'stripe';
import type { BillingCycle } from './checkout';
import { PRICING } from './entitlements';

let stripeSingleton: Stripe | null = null;

/** The Stripe client, or `null` when STRIPE_SECRET_KEY isn't configured. */
export function getStripe(): Stripe | null {
  if (stripeSingleton) return stripeSingleton;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;
  stripeSingleton = new Stripe(key);
  return stripeSingleton;
}

/** The price id for a billing cycle, or `undefined` if not configured. */
export function priceIdForCycle(cycle: BillingCycle): string | undefined {
  return cycle === 'monthly'
    ? process.env.STRIPE_PRICE_PRO_MONTHLY
    : process.env.STRIPE_PRICE_PRO_ANNUAL;
}

/** True only when the secret key AND both price IDs are present. */
export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_PRICE_PRO_MONTHLY &&
      process.env.STRIPE_PRICE_PRO_ANNUAL
  );
}

/** Free trial length (days) — sourced from the single pricing config. */
export const PRO_TRIAL_DAYS = PRICING.trialDays;

/** account_tier integers used across the billing layer. */
export const TIER_PRO = 3;
export const TIER_FREE = 1;

/** Subscription statuses that should grant Pro. */
export function statusGrantsPro(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trialing';
}
