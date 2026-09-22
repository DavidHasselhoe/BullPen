/**
 * Copy and decisions shared by every surface that offers or bills the Pro
 * trial. Pure functions so the wording and the email gate are testable
 * (scripts/test-onboarding-trial.ts) and can never drift between surfaces.
 */

import { PRICING } from './entitlements';
import type { BillingCycle } from './checkout';

/**
 * The renewal terms that have to sit next to a subscribe button, not in the
 * terms of service or an FAQ further down the page.
 *
 * US ROSCA (and California's automatic renewal law, and the EU consumer rights
 * directive) all want the same four facts disclosed clearly and next to the
 * purchase control, before the purchase: what it costs, how often it recurs,
 * that it renews by itself until stopped, and how to stop it. The line this
 * replaces covered the price and said "cancel anytime", but never said the
 * subscription renews itself, nor where to go to cancel, and the only fuller
 * explanation was an FAQ entry below a comparison table.
 *
 * cancelLine names the real path deliberately: the account-menu item that
 * opens the Stripe customer portal is labelled "Manage subscription"
 * (navManageSubscription in navigation.json). If that label is ever renamed,
 * rename it here too, or this disclosure becomes a wrong instruction.
 */
export interface RenewalTerms {
  /** Price, cadence, and the fact that it renews on its own. */
  chargeLine: string;
  /** How to stop it, plus the reminder and the refund window. */
  cancelLine: string;
}

export function renewalTerms(cycle: BillingCycle, options: { trial?: boolean } = {}): RenewalTerms {
  const withTrial = options.trial ?? true;
  const total = cycle === 'annual' ? PRICING.proAnnualPerMonth * 12 : PRICING.proMonthly;
  const per = cycle === 'annual' ? 'a year' : 'a month';
  const every = cycle === 'annual' ? 'every year' : 'every month';

  const chargeLine = withTrial
    ? `Free for ${PRICING.trialDays} days, then $${total} ${per}. It renews automatically ${every} until you cancel.`
    : `$${total} ${per}, renewed automatically ${every} until you cancel.`;

  const reminder = withTrial ? 'We email you 3 days before the trial ends. ' : '';
  const cancelLine =
    `${reminder}Cancel any time from the account menu, under Manage subscription. ` +
    `Refunds within ${PRICING.moneyBackDays} days of your first charge.`;

  return { chargeLine, cancelLine };
}

/** Both lines as one string, for a surface with room for only one. */
export function trialTermsLine(cycle: BillingCycle): string {
  const { chargeLine, cancelLine } = renewalTerms(cycle);
  return `${chargeLine} ${cancelLine}`;
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
