/**
 * Guards the TwelveData credit-budget invariant.
 *
 * Run: npm run test-credit-budget
 *
 * Background: the app has now had four separate production incidents where
 * TwelveData's account-wide 610 credits/min cap was blown for hours at a
 * time. Every one of them had the same shape, and every one of them looked
 * correctly guarded on inspection:
 *
 *   A call site reserves against lib/twelvedata/credit-budget.ts, but the
 *   amount it needs is larger than CRON_CREDIT_SHARE. That reservation can
 *   never be granted, so waitForCronCreditBudget times out — and its
 *   documented behaviour on timeout is to proceed anyway. The call fires
 *   unreserved, the bucket never records it, and the guard has silently
 *   degraded into nothing but added latency.
 *
 * Rounds 1-3 tuned batch sizes, TTLs and concurrency without ever checking
 * that the reservations were arithmetically satisfiable. These assertions
 * encode that check so the next violation fails here instead of on the
 * TwelveData dashboard.
 *
 * Constants are parsed out of the source rather than imported because the
 * route modules pull in Next.js server-only dependencies that can't load in a
 * bare tsx process.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '..');

let failures = 0;

function check(label: string, ok: boolean, detail: string) {
  if (ok) {
    console.log(`  PASS  ${label}`);
  } else {
    failures++;
    console.error(`  FAIL  ${label}\n        ${detail}`);
  }
}

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), 'utf8');
}

/** Pull `const NAME = <number>;` out of a source file. */
function constant(src: string, name: string, file: string): number {
  const m = src.match(new RegExp(`const\\s+${name}\\s*=\\s*([0-9_]+)`));
  if (!m) {
    throw new Error(`could not find constant ${name} in ${file} — did it get renamed?`);
  }
  return Number(m[1].replace(/_/g, ''));
}

const budgetSrc = read('lib/twelvedata/credit-budget.ts');
const screenerSrc = read('lib/market-data/screener-stats.ts');
const prefetchSrc = read('app/api/cron/prefetch-market-data/route.ts');

const SHARE = constant(budgetSrc, 'CRON_CREDIT_SHARE', 'credit-budget.ts');

console.log(`\nCRON_CREDIT_SHARE = ${SHARE}\n`);

// ── 1. Every reservation must be arithmetically satisfiable ──────────────────
console.log('Reservations fit inside the shared budget:');

const reservations: { label: string; cost: number; where: string }[] = [
  {
    label: 'screener-stats /statistics chunk',
    cost:
      constant(screenerSrc, 'CHUNK_SIZE', 'screener-stats.ts') *
      constant(screenerSrc, 'CREDITS_PER_STATS_SYMBOL', 'screener-stats.ts'),
    where: 'lib/market-data/screener-stats.ts',
  },
  {
    label: 'prefetch phase=stats batch',
    cost:
      constant(prefetchSrc, 'STATS_BATCH_SIZE', 'prefetch-market-data') *
      constant(prefetchSrc, 'CREDITS_PER_SYMBOL', 'prefetch-market-data'),
    where: 'app/api/cron/prefetch-market-data/route.ts',
  },
  {
    label: 'prefetch phase=financials batch',
    cost:
      constant(prefetchSrc, 'FINANCIALS_BATCH_SIZE', 'prefetch-market-data') *
      constant(prefetchSrc, 'CREDITS_PER_FINANCIALS_SYMBOL', 'prefetch-market-data'),
    where: 'app/api/cron/prefetch-market-data/route.ts',
  },
];

for (const r of reservations) {
  check(
    `${r.label} = ${r.cost} credits`,
    r.cost <= SHARE,
    `${r.cost} > CRON_CREDIT_SHARE (${SHARE}), so this reservation can never be granted. ` +
      `waitForCronCreditBudget will time out and fire unreserved every single time. ` +
      `Split the work in ${r.where} into units of <= ${SHARE} credits.`
  );
}

// ── 2. The shared budget must leave real headroom under the plan cap ─────────
console.log('\nShared budget leaves headroom for organic traffic:');

const PLAN_CAP = 610;
/** A single stock snapshot page load, per CLAUDE.md's cost table. */
const SNAPSHOT_COST = 71;
check(
  `${PLAN_CAP} - ${SHARE} = ${PLAN_CAP - SHARE} credits/min for live traffic`,
  PLAN_CAP - SHARE >= SNAPSHOT_COST * 2,
  `only ${PLAN_CAP - SHARE} credits/min left for user traffic — under two concurrent ` +
    `~${SNAPSHOT_COST}-credit stock snapshot loads. Lower CRON_CREDIT_SHARE.`
);

// ── 3. screener-stats must never fetch fundamentals live ────────────────────
// This is the specific regression that caused the 2026-08-07 incident: a
// 5-symbol chunk needing 265 + 5x303 = 1,780 credits against a 400 share,
// firing ~1,780 credits inside 45 seconds while the bucket recorded 366.
console.log('\nscreener-stats.ts stays cache-only for fundamentals:');

const FORBIDDEN = ['getIncomeStatement', 'getBalanceSheet', 'getCashFlow'];
for (const fn of FORBIDDEN) {
  check(
    `does not call ${fn}`,
    !new RegExp(`\\b${fn}\\s*\\(`).test(screenerSrc),
    `screener-stats.ts calls ${fn} again. That path is shared with the interactive ` +
      `/api/screener and /api/tools/heatmap routes, so a cold chunk fires ~303 credits ` +
      `per symbol on an ordinary page load and cannot reserve for it. Fundamentals ` +
      `warming belongs solely to prefetch-market-data's phase=financials.`
  );
}

// ── 4. The soft guard must not be used where skipping is required ───────────
console.log('\nGuard semantics are still distinct:');

check(
  'tryReserveCredits exists (hard variant that skips instead of firing)',
  /export async function tryReserveCredits/.test(budgetSrc),
  'tryReserveCredits was removed. waitForCronCreditBudget proceeds anyway on timeout, ' +
    'so it can only ever delay a breach, never prevent one. Optional fetches need the ' +
    'hard variant.'
);

check(
  'waitForCronCreditBudget warns on an unsatisfiable cost',
  /warnIfUnreservable\(cost\)/.test(budgetSrc),
  'the unsatisfiable-reservation warning was removed from waitForCronCreditBudget — ' +
    'that check is what makes a future violation visible in Vercel runtime errors ' +
    'rather than silent.'
);

console.log('');
if (failures > 0) {
  console.error(`${failures} check(s) failed.\n`);
  process.exit(1);
}
console.log('All credit-budget invariants hold.\n');
