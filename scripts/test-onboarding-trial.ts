/**
 * Assert-based checks for the onboarding redesign and 7-day trial. No framework.
 *   npm run test-onboarding-trial
 */

import assert from 'node:assert/strict';
import { PRICING } from '../lib/billing/entitlements';
import { trialTermsLine, shouldSendRenewalReminder } from '../lib/billing/trial-copy';
import { buildTrialEndingEmailHtml, buildTrialRevokedEmailHtml } from '../lib/email/billing-reminder';

/** CLAUDE.md: user-facing copy never uses an em dash or en dash. */
function hasDash(text: string): boolean {
  return /[–—]/.test(text);
}

// ── Task 1: trial length and terms ───────────────────────────────────────────
assert.equal(PRICING.trialDays, 7, 'trial is 7 days everywhere');
assert.equal(
  trialTermsLine('annual'),
  "Free for 7 days, then $108/year. We'll email you 3 days before your trial ends. Cancel anytime."
);
assert.equal(
  trialTermsLine('monthly'),
  "Free for 7 days, then $12/month. We'll email you 3 days before your trial ends. Cancel anytime."
);
assert.ok(!hasDash(trialTermsLine('annual')), 'terms line has no dash');
assert.equal(shouldSendRenewalReminder('trialing'), false, 'trialing gets the trial email, not the renewal one');
assert.equal(shouldSendRenewalReminder('active'), true);
assert.equal(shouldSendRenewalReminder(null), true);

// ── Task 2: trial emails ─────────────────────────────────────────────────────
const ending = buildTrialEndingEmailHtml('$108.00', 'September 22, 2026', 'https://billing.example/portal');
assert.ok(ending.includes('September 22, 2026'), 'trial-ending email states the end date');
assert.ok(ending.includes('$108.00'), 'trial-ending email states the amount');
assert.ok(ending.includes('https://billing.example/portal'), 'trial-ending email links to manage/cancel');
assert.ok(!hasDash(ending), 'trial-ending email has no dash');

const revoked = buildTrialRevokedEmailHtml('$12.00', 30);
assert.ok(revoked.includes('$12.00'), 'revoked email states what was charged');
assert.ok(revoked.includes('30 days'), 'revoked email states the refund window');
assert.ok(!hasDash(revoked), 'revoked email has no dash');

console.log('test-onboarding-trial: all assertions passed');
