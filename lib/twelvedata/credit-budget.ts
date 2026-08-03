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
const CRON_CREDIT_SHARE = 400;

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
 */
export async function waitForCronCreditBudget(cost: number, maxWaitMs = 65_000): Promise<void> {
  const start = Date.now();
  while (!(await reserveCronCredits(cost))) {
    if (Date.now() - start > maxWaitMs) return;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
}
