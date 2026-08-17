import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { createServerClient } from '@/lib/supabase/client';
import { getTier, isAdmin } from '@/lib/billing/tier';
import { logSecurityEvent } from '@/lib/security/security-events';
import { checkAndInvalidateFundamentals } from '@/lib/cache/fundamentals-freshness';
import { waitForCronCreditBudget } from '@/lib/twelvedata/credit-budget';

const BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1000; // 1 second between batches → ~300 credits/min max, well under 610 limit
/** 1 credit per company (the /fundamentals/last_changes check this route makes). */
const CREDITS_PER_COMPANY = 1;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET /api/admin/refresh-fundamentals
 *
 * Batch-checks TwelveData last_changes for a set of companies and expires
 * any stale cache entries. Only refreshes data types that have actually changed.
 *
 * Query params:
 *   ?tickers=AAPL,MSFT,NVDA  — explicit list (optional)
 *   ?limit=50                 — max companies to process (default 50, max 200)
 *
 * Without ?tickers, processes companies ordered by oldest fundamentals_checked_at
 * (including NULL = never checked).
 *
 * Credit cost: 1 per company (last_changes check), plus only the changed data
 * types on any subsequent user-triggered fetches.
 *
 * Requires authenticated session (service-role check happens via withAuth).
 */
async function handler(
  request: NextRequest,
  _context: unknown,
  session: { userId: string }
): Promise<NextResponse> {
  const supabase = createServerClient();

  // Admin-only — same 404 strategy as /admin/costs so the route is invisible
  // to non-admins (anonymous, free, or pro users).
  if (!isAdmin(await getTier(session.userId))) {
    logSecurityEvent('admin_access_denied', { userId: session.userId, path: '/api/admin/refresh-fundamentals' });
    return addSecurityHeaders(
      NextResponse.json({ error: 'not_found' }, { status: 404 })
    );
  }

  const { searchParams } = new URL(request.url);
  const tickersParam = searchParams.get('tickers');
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '50', 10), 200);

  let tickers: string[];

  if (tickersParam) {
    tickers = tickersParam.split(',').map((t) => t.trim().toUpperCase()).filter(Boolean);
  } else {
    // Find companies with oldest (or missing) freshness checks
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: companies, error } = await (supabase as any)
      .from('companies')
      .select('ticker')
      .order('fundamentals_checked_at', { ascending: true, nullsFirst: true })
      .limit(limit);

    if (error) {
      return addSecurityHeaders(
        NextResponse.json({ error: 'Failed to query companies' }, { status: 500 })
      );
    }

    tickers = ((companies ?? []) as Array<{ ticker: string }>).map((c) => c.ticker).filter(Boolean);
  }

  if (tickers.length === 0) {
    return addSecurityHeaders(NextResponse.json({ processed: 0, totalExpired: 0 }));
  }

  // Process in rate-limited batches
  const results: Array<{ ticker: string; keysExpired: number; error?: string }> = [];
  let totalExpired = 0;

  for (let i = 0; i < tickers.length; i += BATCH_SIZE) {
    const batch = tickers.slice(i, i + BATCH_SIZE);

    // Shares the same per-minute bucket as the screener-refresh and
    // prefetch-market-data crons — this route used to pace itself in
    // isolation, so a manual admin run landing in the same wall-clock minute
    // as a cron batch could stack on top of it past the 610/min plan cap.
    await waitForCronCreditBudget(batch.length * CREDITS_PER_COMPANY);

    await Promise.all(
      batch.map(async (ticker) => {
        const result = await checkAndInvalidateFundamentals(ticker);
        results.push({
          ticker,
          keysExpired: result.keysExpired.length,
          ...(result.error ? { error: result.error } : {}),
        });
        totalExpired += result.keysExpired.length;
      })
    );

    // Throttle between batches (not after the last one)
    if (i + BATCH_SIZE < tickers.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  return addSecurityHeaders(
    NextResponse.json({
      processed: results.length,
      totalExpired,
      results,
    })
  );
}

export const GET = withAuth(handler);
