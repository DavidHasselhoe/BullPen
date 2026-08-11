/**
 * Market Calendar Pre-warm Cron
 * GET /api/cron/prefetch-calendar?batch=N
 *
 * Warms the per-day calendar caches (lib/market-data/calendar-days.ts) over a
 * rolling today-7 .. today+45 window so every reader hits cache instead of
 * paying for a live fetch: the calendar tool, the Discover earnings widget,
 * the daily brief, the earnings-email cron and the Instagram carousel.
 *
 * WHY THIS EXISTS. /earnings_calendar caps at 1200 rows and silently drops
 * whole days, so earnings has to be fetched one day at a time (see that
 * module's header for the evidence). One day is 40 credits, so a cold month
 * opened interactively fills only a bounded number of days per request and
 * converges over a couple of minutes. Pre-warming makes that invisible.
 *
 * Deliberately a separate route rather than a `phase=` on prefetch-market-data:
 * that cron's entire work model is symbol-indexed (SIGNIFICANT_TICKERS order,
 * symbol -> batch mapping, CREDITS_PER_SYMBOL), and a date-indexed sweep
 * shares none of it. Separate files also keep each one's reservation constants
 * independently assertable by scripts/test-credit-budget.ts.
 *
 * Cost: the window is 53 days, and both earnings and dividends must be
 * fetched per day (dividends is a global feed whose range requests collapse
 * onto a single day), so a plan is 53 + 53 + 1 split + 1 IPO = 108 units.
 * A fully cold sweep is 108 x 40 = ~4,320 credits across ~27 batches, or
 * ~29 minutes at one batch per 65s — roughly 150 credits/min sustained,
 * against the 610/min account cap.
 *
 * That is the worst case, not the daily cost. Settled past days carry a
 * 90-day TTL and the freshness check skips any unit whose days are all still
 * live, so steady state only fetches the newly-uncovered forward edge plus
 * whatever recent days have aged out.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  buildWarmPlan,
  warmCalendarUnit,
  CALENDAR_CREDITS_PER_REQUEST,
} from '@/lib/market-data/calendar-days';
import { todayET } from '@/lib/dates/calendar-format';

export const maxDuration = 60;

/**
 * Units warmed per HTTP call. 4 x 40 = 160 credits, comfortably inside
 * CRON_CREDIT_SHARE (400) so the reservation is always actually grantable —
 * an unsatisfiable reservation is the failure mode credit-budget.ts warns
 * about, where every attempt times out and fires unreserved anyway.
 */
const UNITS_PER_BATCH = 4;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = todayET();
  const plan = buildWarmPlan(today);
  const totalBatches = Math.ceil(plan.length / UNITS_PER_BATCH);

  const batchIndex = Number.parseInt(request.nextUrl.searchParams.get('batch') ?? '0', 10);
  if (!Number.isFinite(batchIndex) || batchIndex < 0 || batchIndex >= totalBatches) {
    return NextResponse.json({
      success: true,
      batch: batchIndex,
      totalBatches,
      warmed: 0,
      skipped: 0,
      done: true,
    });
  }

  const units = plan.slice(batchIndex * UNITS_PER_BATCH, (batchIndex + 1) * UNITS_PER_BATCH);
  const nextBatch = batchIndex + 1 < totalBatches ? batchIndex + 1 : null;

  let warmed = 0;
  let skipped = 0;
  const errors: string[] = [];

  // Sequential on purpose: warmCalendarUnit reserves credits per unit, and
  // firing them concurrently would race the same budget — the swarm-of-waiters
  // problem documented in credit-budget.ts.
  for (const unit of units) {
    try {
      const result = await warmCalendarUnit(unit, today);
      if (result.skipped) skipped++;
      else warmed += result.warmed;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${unit.kind} ${unit.from}..${unit.to}: ${msg}`);
    }
  }

  return NextResponse.json({
    success: true,
    batch: batchIndex,
    totalBatches,
    warmed,
    skipped,
    errors,
    // Worst-case credits this batch could have reserved, so a run's spend is
    // checkable against TwelveData's /api_usage without reading the source.
    maxCredits: units.length * CALENDAR_CREDITS_PER_REQUEST,
    nextBatch,
    done: nextBatch === null,
  });
}
