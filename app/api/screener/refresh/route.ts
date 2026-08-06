/**
 * POST /api/screener/refresh
 *
 * Fetches TwelveData /statistics for a batch of symbols and upserts them into
 * screener_stats. Also stamps market_cap + last_refreshed_at back onto
 * screener_universe and promotes any ticker clearing the market-cap floor to
 * tier 1, so the active set self-maintains toward ~S&P 1500 breadth.
 *
 * Query params:
 *   mode=active|discovery   (default active)
 *   batch=N                 (active mode only; 0-indexed slice of the active universe)
 *
 * Active mode: refreshes a 5-symbol slice of the tier-1 universe (ordered by
 *   market cap). Used by the daily + extended crons.
 * Discovery mode: refreshes the 5 least-recently-refreshed tier-0 tickers to
 *   discover their market caps (and promote the big ones). Self-consuming — no
 *   batch index needed.
 *
 * Credits per call: 5 × 53 = 265 for /statistics. Deliberately half the old
 * 10-symbol batch (530 credits) — that size left only ~30 credits/min of the
 * 610/min plan cap for organic user traffic once the shared credit-budget
 * guard reserved its share, which real per-page-load costs (a single stock
 * snapshot alone runs ~71 credits) could blow through on its own. See
 * CRON_CREDIT_SHARE in lib/twelvedata/credit-budget.ts. The reservation for
 * this itself now happens inside fetchAndUpsertScreenerStats (per chunk,
 * CHUNK_SIZE=5 there too) rather than here, so the on-demand screener/heatmap
 * callers of that same function are covered by the same guard.
 *
 * Financials (income/balance/cash-flow, for the health score) are fetched
 * separately inside fetchAndUpsertScreenerStats -> fetchFinancials
 * (lib/market-data/screener-stats.ts) on a per-cold-symbol basis, ~101
 * credits per statement, each reserved against the same shared budget.
 *
 * Auth: requires either a `CRON_SECRET` bearer header (GitHub Actions crons)
 * or an admin user session (the screener page's "Refresh Data" button, which
 * is only rendered for admins). Non-admin/anonymous callers get a 404, same
 * as the other admin-only routes.
 */

import { NextRequest, NextResponse } from 'next/server';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { withRateLimit, addSecurityHeaders, getSessionForApiRoute } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isAdmin } from '@/lib/billing/tier';
import {
  getActiveUniverse,
  getDiscoveryBatch,
  MARKET_CAP_PROMOTION_FLOOR,
} from '@/lib/market-data/screener-universe';
import { fetchAndUpsertScreenerStats } from '@/lib/market-data/screener-stats';

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 5;

/** Stamp market_cap + last_refreshed_at onto screener_universe and promote big caps. */
async function stampUniverse(rows: { ticker: string; market_cap: number | null }[]) {
  if (rows.length === 0) return;
  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const now = new Date().toISOString();

  const stamp = rows.map((r) => ({ ticker: r.ticker, market_cap: r.market_cap, last_refreshed_at: now }));
  await db.from('screener_universe').upsert(stamp, { onConflict: 'ticker' }).then(
    () => undefined,
    () => undefined,
  );

  const promote = rows
    .filter((r) => (r.market_cap ?? 0) >= MARKET_CAP_PROMOTION_FLOOR)
    .map((r) => r.ticker);
  if (promote.length > 0) {
    await db.from('screener_universe').update({ tier: 1 }).in('ticker', promote).eq('tier', 0).then(
      () => undefined,
      () => undefined,
    );
  }
}

/**
 * Two callers hit this route: the nightly/extended GitHub Actions crons (no
 * user session — authenticate via CRON_SECRET bearer header) and the "Refresh
 * Data" button on the screener page (a real user session — must be admin).
 * This triggers a live TwelveData /statistics fetch (up to 265 credits per
 * call) and was previously reachable by anyone, including signed-out callers.
 */
async function isAuthorized(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  const session = await getSessionForApiRoute();
  if (!session) return false;
  return isAdmin(await getTier(session.userId));
}

async function handler(request: NextRequest): Promise<NextResponse> {
  // Same 404 strategy as other admin-only routes so it's invisible to
  // non-admins (anonymous, free, or pro users) rather than a visible 403.
  if (!(await isAuthorized(request))) {
    return addSecurityHeaders(
      NextResponse.json({ error: 'not_found' }, { status: 404 })
    );
  }

  const sp = request.nextUrl.searchParams;
  const mode = sp.get('mode') === 'discovery' ? 'discovery' : 'active';
  const batchIndex = parseInt(sp.get('batch') ?? '0', 10);

  if (!process.env.TWELVE_DATA_API_KEY) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'TWELVE_DATA_API_KEY not configured' }, { status: 500 })
    );
  }

  let symbols: string[];
  let totalBatches: number | undefined;

  if (mode === 'discovery') {
    symbols = await getDiscoveryBatch(BATCH_SIZE);
  } else {
    const universe = await getActiveUniverse();
    totalBatches = Math.ceil(universe.length / BATCH_SIZE);
    const start = batchIndex * BATCH_SIZE;
    symbols = universe.slice(start, start + BATCH_SIZE);
  }

  if (symbols.length === 0) {
    return addSecurityHeaders(
      NextResponse.json({ success: true, done: true, mode, totalBatches })
    );
  }

  try {
    const rows = await fetchAndUpsertScreenerStats(symbols);
    await stampUniverse(rows.map((r) => ({ ticker: r.ticker, market_cap: r.market_cap })));

    const promoted = rows.filter((r) => (r.market_cap ?? 0) >= MARKET_CAP_PROMOTION_FLOOR).length;

    if (mode === 'discovery') {
      // Self-consuming: "done" once a sweep returns fewer than a full batch.
      return addSecurityHeaders(
        NextResponse.json({
          success: true,
          mode,
          refreshed: rows.length,
          promoted,
          symbols,
          done: symbols.length < BATCH_SIZE,
        })
      );
    }

    const nextBatch = totalBatches != null && batchIndex + 1 < totalBatches ? batchIndex + 1 : null;
    return addSecurityHeaders(
      NextResponse.json({
        success: true,
        mode,
        batch: batchIndex,
        refreshed: rows.length,
        promoted,
        symbols,
        nextBatch,
        totalBatches,
        done: nextBatch === null,
      })
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 })
      );
    }
    return addSecurityHeaders(
      NextResponse.json(
        { success: false, error: err instanceof Error ? err.message : 'Unknown error' },
        { status: 500 }
      )
    );
  }
}

// Limit to 5 refresh calls per minute — each costs up to 265 credits. The
// real per-minute enforcement is the shared credit-budget guard above; this
// is just an outer ceiling against abuse.
export const POST = withRateLimit(handler, { windowMs: 60_000, maxRequests: 5 });
