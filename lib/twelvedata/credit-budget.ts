/**
 * Shared, Redis-backed guard against TwelveData's account-wide 610
 * credits/minute cap.
 *
 * Three callers share this bucket: the screener refresh cron (up to ~265
 * credits per 5-symbol batch), the prefetch-market-data cron (~350 credits
 * per 5-symbol batch), and the admin fundamentals-freshness sweep (~5
 * credits per 5-company batch). None of them is the only caller sharing the
 * API key, though — live user traffic (stock snapshots, quotes, candles)
 * draws from the same per-minute budget and is unpredictable: a single stock
 * snapshot page load alone costs ~71 credits. Pacing cron batches purely on
 * a fixed delay (as the GitHub Actions workflows do) assumes the cron has
 * the full 610 to itself; in practice concurrent user traffic plus the
 * cron's own batches has been observed blowing past 3000+ credits in a
 * single minute on the TwelveData dashboard. This tracks actual reserved
 * usage in a rolling per-minute bucket and only lets a cron batch proceed
 * within the shared conservative share, leaving real headroom for organic
 * traffic to draw on without either side tripping the account-wide cap.
 */

import { Redis } from '@upstash/redis';

let _client: Redis | null = null;

function client(): Redis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null;
  if (!_client) _client = Redis.fromEnv();
  return _client;
}

const WINDOW_SECONDS = 60;

/**
 * The crons' own self-imposed share of the 610/min plan limit. The largest
 * single reservation against this budget is prefetch-market-data's 5-symbol
 * batch (~350 credits), so 400 comfortably clears any one batch while
 * leaving ~210 credits/min of real headroom for organic traffic — enough for
 * several concurrent ~71-credit stock-snapshot loads, unlike the previous
 * 580/610 split (batches sized for the old 10-symbol/530-credit batch),
 * which left only ~30/min for everything else sharing the account. Its job
 * still isn't to shrink a single batch's footprint but to stop a *second*
 * batch (an overlapping cron run, the discovery sweep, or someone clicking
 * "Refresh Data" mid-run) from stacking on top of it in the same minute,
 * which is what actually produces the multi-thousand-credit spikes seen on
 * the TwelveData dashboard.
 */
export const CRON_CREDIT_SHARE = 400;

/**
 * A reservation larger than the whole share can never be granted: every
 * attempt fails, the caller exhausts its wait, and `waitForCronCreditBudget`
 * proceeds anyway — so the guard degrades into pure added latency while the
 * real spend goes unrecorded. That failure mode has now caused the same
 * production incident three separate times (CHUNK_SIZE=10 needing 530,
 * screener-stats needing 265+1515 against this 400 share), each time looking
 * like a "guarded" call site on inspection.
 *
 * Any cost above the share is therefore a programming error, not a runtime
 * condition. Log it loudly rather than failing the request: it surfaces in
 * Vercel runtime errors where the previous silent leaks did not.
 * `scripts/test-credit-budget.ts` asserts every caller's constant stays under
 * the share so this never ships again.
 */
function warnIfUnreservable(cost: number): boolean {
  if (cost <= CRON_CREDIT_SHARE) return false;
  console.error(
    `[credit-budget] reservation of ${cost} credits exceeds CRON_CREDIT_SHARE ` +
    `(${CRON_CREDIT_SHARE}) and can never be granted — this call site will fire ` +
    `unreserved and blow the account-wide 610/min cap. Split the work into ` +
    `units of <= ${CRON_CREDIT_SHARE} credits.`
  );
  return true;
}

function bucketKey(): string {
  const bucket = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
  return `twelvedata:cron-credits:${bucket}`;
}

/**
 * Atomically reserves `cost` credits against the current minute's cron
 * budget. Returns false (reservation rolled back) if that would exceed
 * CRON_CREDIT_SHARE — caller should back off and retry shortly. Fails open
 * (returns true) if Redis isn't configured or errors, so local dev without
 * Upstash, or a Redis outage, doesn't block the refresh entirely.
 */
export async function reserveCronCredits(cost: number): Promise<boolean> {
  const c = client();
  if (!c) return true;
  const key = bucketKey();
  try {
    const total = await c.incrby(key, cost);
    if (total === cost) void c.expire(key, WINDOW_SECONDS * 2);
    if (total > CRON_CREDIT_SHARE) {
      await c.decrby(key, cost);
      return false;
    }
    return true;
  } catch {
    return true;
  }
}

/**
 * Waits until `cost` credits fit within the current/next minute's cron
 * budget, polling every 3s. Gives up and proceeds anyway after `maxWaitMs`
 * so a Redis hiccup or unexpectedly sustained overage can't wedge the whole
 * refresh chain — this is a pacing guard, not a hard cap. 65s comfortably
 * spans a full minute-bucket rollover even if the wait starts right after
 * the bucket was created.
 *
 * Only safe for reservations that are actually satisfiable (`cost` <=
 * CRON_CREDIT_SHARE) AND whose callers are naturally staggered. A swarm of
 * concurrent waiters gives up in lockstep and then all fire at once, which
 * defeats the pacing entirely — use `tryReserveCredits` and skip the work
 * instead whenever the caller can tolerate not fetching.
 */
export async function waitForCronCreditBudget(cost: number, maxWaitMs = 65_000): Promise<void> {
  warnIfUnreservable(cost);
  const start = Date.now();
  while (!(await reserveCronCredits(cost))) {
    if (Date.now() - start > maxWaitMs) return;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}

/**
 * Hard variant of `waitForCronCreditBudget`: returns false instead of
 * proceeding anyway, so the caller skips the work rather than firing
 * unreserved. Use this anywhere the fetch is optional — a stale cache entry,
 * a health score that can keep its previous value, an interactive request
 * that would rather render slightly older data than contribute to an
 * account-wide rate-limit breach.
 *
 * This is the difference that matters: `waitForCronCreditBudget` can only
 * ever delay a breach, while this can prevent one.
 */
export async function tryReserveCredits(cost: number, maxWaitMs = 8_000): Promise<boolean> {
  if (warnIfUnreservable(cost)) return false;
  const start = Date.now();
  while (!(await reserveCronCredits(cost))) {
    if (Date.now() - start > maxWaitMs) return false;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return true;
}

/**
 * Ceiling for interactive/organic traffic (stock snapshot, statistics,
 * financials) — reservations against this ceiling write into the SAME
 * per-minute counter reserveCronCredits uses (see bucketKey), not a
 * separate budget. Set well above CRON_CREDIT_SHARE (580 vs 400) so a live
 * page load takes priority over background cron work by construction: a
 * cron reservation can never push the shared total past its own 400-credit
 * share, while organic traffic can use the rest of the headroom up to this
 * ceiling. The ~30-credit gap under the true 610 plan cap is deliberate
 * slack for the cheap (1-credit) calls that are never reserved at all —
 * quote, candles, company profile.
 */
export const ORGANIC_CREDIT_CEILING = 580;

/**
 * One-shot admission check for interactive/organic traffic. Reserves
 * against the same shared per-minute bucket reserveCronCredits uses, but
 * checked against ORGANIC_CREDIT_CEILING instead of CRON_CREDIT_SHARE.
 *
 * Deliberately NOT a polling/wait variant like waitForCronCreditBudget or
 * tryReserveCredits — an interactive request should degrade to cached/stale
 * data immediately under load, not add latency hoping the budget frees up
 * a few seconds later. There is no "proceed anyway" outcome here: a false
 * result means the caller must have a real fallback (stale cache, or a
 * smaller request with fewer sub-fetches) — same hard-fail contract as
 * tryReserveCredits, just without the wait loop.
 */
export async function tryReserveOrganicCredits(cost: number): Promise<boolean> {
  const c = client();
  if (!c) return true;
  const key = bucketKey();
  try {
    const total = await c.incrby(key, cost);
    if (total === cost) void c.expire(key, WINDOW_SECONDS * 2);
    if (total > ORGANIC_CREDIT_CEILING) {
      await c.decrby(key, cost);
      return false;
    }
    return true;
  } catch {
    return true;
  }
}
