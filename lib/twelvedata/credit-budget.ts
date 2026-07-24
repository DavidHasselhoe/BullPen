/**
 * Shared, Redis-backed guard against TwelveData's account-wide 610
 * credits/minute cap.
 *
 * The screener refresh cron is the one bulk, schedulable consumer of
 * TwelveData credits (up to ~530 credits per 10-symbol batch), but it isn't
 * the only caller sharing the same API key — live user traffic (stock
 * snapshots, quotes, candles) draws from the same per-minute budget and is
 * unpredictable. Pacing cron batches purely on a fixed delay (as the
 * GitHub Actions workflows do) assumes the cron has the full 610 to itself;
 * in practice concurrent user traffic plus the cron's own batches has been
 * observed blowing past 3000+ credits in a single minute on the TwelveData
 * dashboard. This tracks actual reserved usage in a rolling per-minute
 * bucket and only lets the cron proceed within its own conservative share,
 * leaving headroom for organic traffic.
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
 * The cron's own self-imposed share of the 610/min plan limit. A single
 * 10-symbol batch already costs up to 530 (50/symbol for /statistics + up to
 * 3/symbol for financials), so this must comfortably clear one batch's worst
 * case — its job isn't to shrink a single batch's footprint but to stop a
 * *second* batch (an overlapping cron run, the discovery sweep, or someone
 * clicking "Refresh Data" mid-run) from stacking on top of it in the same
 * minute, which is what actually produces the multi-thousand-credit spikes
 * seen on the TwelveData dashboard.
 */
const CRON_CREDIT_SHARE = 580;

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
