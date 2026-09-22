/**
 * Assert-based checks for the onboarding redesign and 7-day trial. No framework.
 *   npm run test-onboarding-trial
 */

import assert from 'node:assert/strict';
import { PRICING } from '../lib/billing/entitlements';
import { renewalTerms, trialTermsLine, shouldSendRenewalReminder } from '../lib/billing/trial-copy';
import { buildTrialEndingEmailHtml, buildTrialRevokedEmailHtml } from '../lib/email/billing-reminder';
import { checkoutReturnUrls, parseReturnTarget } from '../lib/billing/checkout-return';
import {
  parsePendingOnboarding,
  experienceLevelFor,
  notificationOverrides,
  DEFAULT_ALERTS,
} from '../lib/onboarding/pending-onboarding';
import { STARTER_STOCKS } from '../lib/onboarding/starter-stocks';

/** CLAUDE.md: user-facing copy never uses an em dash or en dash. */
function hasDash(text: string): boolean {
  return /[–—]/.test(text);
}

// ── Task 1: trial length and terms ───────────────────────────────────────────
assert.equal(PRICING.trialDays, 7, 'trial is 7 days everywhere');
// Renewal disclosure. Asserted by fact rather than by exact string, because
// what the law wants is the four facts sitting next to the button: price,
// cadence, that it renews by itself, and how to stop it.
for (const cycle of ['annual', 'monthly'] as const) {
  const { chargeLine, cancelLine } = renewalTerms(cycle);
  const total = cycle === 'annual' ? PRICING.proAnnualPerMonth * 12 : PRICING.proMonthly;
  const both = `${chargeLine} ${cancelLine}`;

  assert.ok(chargeLine.includes(`$${total}`), `${cycle}: states the real price`);
  assert.match(chargeLine, cycle === 'annual' ? /a year/ : /a month/, `${cycle}: states the billing cycle`);
  assert.match(chargeLine, /renews automatically/, `${cycle}: says it renews by itself`);
  assert.ok(chargeLine.includes(`Free for ${PRICING.trialDays} days`), `${cycle}: states the trial length`);
  assert.match(cancelLine, /Manage subscription/, `${cycle}: says where to cancel`);
  assert.ok(cancelLine.includes(`${PRICING.moneyBackDays} days`), `${cycle}: states the refund window`);
  assert.ok(!hasDash(both), `${cycle}: disclosure has no dash`);
}

// Without a trial (a straight subscribe) the price and the renewal still have
// to be there; only the trial sentence drops.
const noTrial = renewalTerms('monthly', { trial: false });
assert.doesNotMatch(noTrial.chargeLine, /Free for/, 'no trial: makes no trial claim');
assert.match(noTrial.chargeLine, /renewed automatically/, 'no trial: still says it renews');

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

// ── Task 3: checkout return URLs ─────────────────────────────────────────────
assert.deepEqual(checkoutReturnUrls('https://bullpen.no', 'upgrade'), {
  success: 'https://bullpen.no/upgrade?checkout=success&session_id={CHECKOUT_SESSION_ID}',
  cancel: 'https://bullpen.no/upgrade?checkout=cancelled',
});
assert.deepEqual(checkoutReturnUrls('https://bullpen.no', 'onboarding'), {
  success: 'https://bullpen.no/dashboard?trial=started',
  cancel: 'https://bullpen.no/get-started/trial',
});
assert.equal(parseReturnTarget('onboarding'), 'onboarding');
assert.equal(parseReturnTarget('https://evil.example'), 'upgrade', 'anything unknown falls back, never a raw URL');
assert.equal(parseReturnTarget(undefined), 'upgrade');

// ── Task 4: onboarding staging ───────────────────────────────────────────────
const now = Date.parse('2026-09-15T12:00:00Z');
const good = JSON.stringify({
  version: 2,
  savedAt: '2026-09-15T11:00:00Z',
  style: 'plain',
  picks: [{ ticker: 'NVDA', name: 'NVIDIA' }],
  alerts: { price_alerts: true, upcoming_earnings: false, dividend_reminder: true },
});
assert.deepEqual(parsePendingOnboarding(good, now), {
  style: 'plain',
  picks: [{ ticker: 'NVDA', name: 'NVIDIA' }],
  alerts: { price_alerts: true, upcoming_earnings: false, dividend_reminder: true },
});
assert.equal(parsePendingOnboarding(null, now), null);
assert.equal(parsePendingOnboarding('not json', now), null);
assert.equal(
  parsePendingOnboarding(JSON.stringify({ version: 1, savedAt: '2026-09-15T11:00:00Z', experience_level: 'beginner' }), now),
  null,
  'old v1 quiz payload is rejected'
);
assert.equal(
  parsePendingOnboarding(good.replace('2026-09-15T11:00:00Z', '2026-09-12T11:00:00Z'), now),
  null,
  'older than 48h is expired'
);
assert.equal(
  parsePendingOnboarding(JSON.stringify({ ...JSON.parse(good), style: 'expert' }), now),
  null,
  'unknown style rejected'
);
// Picks are capped and sanitized: bad entries dropped, at most 20 kept.
const manyPicks = Array.from({ length: 25 }, (_, i) => ({ ticker: `T${i}`, name: `Co ${i}` }));
const capped = parsePendingOnboarding(
  JSON.stringify({ ...JSON.parse(good), picks: [...manyPicks, { ticker: 42 }] }),
  now
);
assert.equal(capped?.picks.length, 20);

assert.equal(experienceLevelFor('plain'), 'beginner');
assert.equal(experienceLevelFor('market'), 'intermediate');

assert.deepEqual(notificationOverrides(DEFAULT_ALERTS), {}, 'all on writes nothing, since unset already means on');
assert.deepEqual(
  notificationOverrides({ price_alerts: true, upcoming_earnings: false, dividend_reminder: false }),
  { upcoming_earnings: false, dividend_reminder: false }
);

assert.equal(STARTER_STOCKS.length, 11);
assert.ok(STARTER_STOCKS.some((s) => s.ticker === 'KO') && STARTER_STOCKS.some((s) => s.ticker === 'JPM'));
assert.ok(!STARTER_STOCKS.some((s) => s.ticker === 'SPY' || s.ticker === 'QQQ'), 'starter list is individual companies, no ETFs');

console.log('test-onboarding-trial: all assertions passed');
