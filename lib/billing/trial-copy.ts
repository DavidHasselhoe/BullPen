/**
 * Copy and decisions shared by every surface that offers or bills the Pro
 * trial. Pure functions so the wording and the email gate are testable
 * (scripts/test-onboarding-trial.ts) and can never drift between surfaces.
 */

import { PRICING } from './entitlements';
import type { BillingCycle } from './checkout';

/** The terms line shown directly under a trial button. States the price after
 *  the trial, the reminder, and cancellation, which an auto-renewing trial
 *  must disclose up front. */
export function trialTermsLine(cycle: BillingCycle): string {
  const after =
    cycle === 'annual' ? `$${PRICING.proAnnualPerMonth * 12}/year` : `$${PRICING.proMonthly}/month`;
  return `Free for ${PRICING.trialDays} days, then ${after}. We'll email you 3 days before your trial ends. Cancel anytime.`;
}

/**
 * Whether `invoice.upcoming` should send the generic renewal email. A
 * subscription still in its trial gets the dedicated trial-ending email from
 * `customer.subscription.trial_will_end` instead, so it is never sent two
 * reminders for the same charge.
 */
export function shouldSendRenewalReminder(subscriptionStatus: string | null | undefined): boolean {
  return subscriptionStatus !== 'trialing';
}
