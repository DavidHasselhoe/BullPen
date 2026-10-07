import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { getCached, getCachedStale, setCached } from '@/lib/cache/market-data-cache';
import { coalesce } from '@/lib/cache/request-coalesce';
import { tryReserveOrganicCredits } from '@/lib/twelvedata/credit-budget';
import {
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow,
  getDividends,
  getSplits,
  withRateLimitRetry,
  TwelveDataRateLimitError,
} from '@/lib/twelvedata/twelvedata-client';
import { getFiscalCalendar, periodForStatement, type FiscalCalendar } from '@/lib/finance/fiscal-calendar';
import type { FiscalTag } from '@/lib/finance/fiscal-label';

/**
 * Reserves against the shared per-minute credit budget (see
 * lib/twelvedata/credit-budget.ts) before firing one of the ~101-credit
 * statement fetches. A denied reservation falls back to the last known
 * stale value instead of risking the account-wide 610/min cap on a burst
 * of concurrent cold tickers; only genuinely uncached tickers surface as
 * `{ denied: true }` with nothing to show.
 */
async function fetchGatedStatement<T>(
  cacheKey: string,
  cost: number,
  fetcher: () => Promise<T>
): Promise<{ denied: false; data: T } | { denied: true }> {
  if (await tryReserveOrganicCredits(cost)) {
    return { denied: false, data: await coalesce(cacheKey, () => withRateLimitRetry(fetcher)) };
  }
  const stale = await getCachedStale<T>(cacheKey);
  if (stale !== null) return { denied: false, data: stale };
  return { denied: true };
}

type FinancialType = 'income' | 'balance' | 'cashflow' | 'dividends' | 'splits';
type Period = 'quarterly' | 'annual';

// Splits are announced weeks ahead and happen rarely (years apart for most stocks).
// Everything else updates quarterly, so 24h is fine.
function ttlForType(type: FinancialType): number {
  if (type === 'splits') return 30 * 24 * 60 * 60;
  return 24 * 60 * 60;
}

/**
 * Tags each statement row with the company's own fiscal period (from SEC), at
 * response time so the cached TwelveData rows stay raw. Rows SEC can't place
 * go out untagged and the client labels them by calendar quarter.
 */
function withFiscal(rows: unknown, calendar: FiscalCalendar | null, period: Period): unknown {
  if (!calendar || !Array.isArray(rows)) return rows;
  return rows.map((row: { fiscal_date?: string }) => {
    const p = row.fiscal_date ? periodForStatement(calendar, row.fiscal_date, period === 'annual') : null;
    if (!p) return row;
    const fiscal: FiscalTag = {
      quarter: period === 'annual' ? null : p.fiscalQuarter,
      year: p.fiscalYear,
      offCalendar: calendar.offCalendar,
      periodEnd: p.periodEnd,
      reportedOn: p.reportedOn,
    };
    return { ...row, fiscal };
  });
}

async function handler(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  const symbol = ticker.toUpperCase();
  const { searchParams } = new URL(request.url);
  const type = (searchParams.get('type') ?? 'income') as FinancialType;
  const period = (searchParams.get('period') ?? 'quarterly') as Period;
  const cacheKey = `financials:${symbol}:${type}:${period}`;
  // Started now so the SEC lookup overlaps the statement fetch.
  const calendar = type === 'income' || type === 'balance' || type === 'cashflow'
    ? getFiscalCalendar(symbol).catch(() => null)
    : Promise.resolve(null);

  try {
    const cached = await getCached<unknown>(cacheKey);
    if (cached) {
      return addSecurityHeaders(NextResponse.json({ success: true, data: withFiscal(cached, await calendar, period), type, period }));
    }

    // withRateLimitRetry guards against a genuine 429 (rare on the current 610/min
    // Venture plan) so it doesn't surface as a false "no data" to the client — same
    // pattern as /health-score. It does not cover transient network errors (fetch
    // failures, socket resets); those still propagate to the catch block below.
    let result;
    switch (type) {
      case 'income': {
        // Coalesced on cacheKey — HealthScoreCard reads the same key and may
        // already have this in flight on a cold stock page load.
        const outcome = await fetchGatedStatement(cacheKey, 101, () => getIncomeStatement(symbol, period));
        if (outcome.denied) {
          return addSecurityHeaders(NextResponse.json({ success: false, error: 'rate_limited', type, period }, { status: 429 }));
        }
        result = outcome.data;
        break;
      }
      case 'balance': {
        const outcome = await fetchGatedStatement(cacheKey, 101, () => getBalanceSheet(symbol, period));
        if (outcome.denied) {
          return addSecurityHeaders(NextResponse.json({ success: false, error: 'rate_limited', type, period }, { status: 429 }));
        }
        result = outcome.data;
        break;
      }
      case 'cashflow': {
        const outcome = await fetchGatedStatement(cacheKey, 101, () => getCashFlow(symbol, period));
        if (outcome.denied) {
          return addSecurityHeaders(NextResponse.json({ success: false, error: 'rate_limited', type, period }, { status: 429 }));
        }
        result = outcome.data;
        break;
      }
      case 'dividends':
        result = await withRateLimitRetry(() => getDividends(symbol));
        break;
      case 'splits':
        result = await withRateLimitRetry(() => getSplits(symbol));
        break;
      default:
        return addSecurityHeaders(
          NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 })
        );
    }

    // Only cache non-empty results — an empty array can come from a transient/partial
    // TwelveData response (200 OK, no rows) rather than a genuine "no data" answer.
    // Caching it here would poison the same key /health-score reads from for a full day.
    if (Array.isArray(result) ? result.length > 0 : !!result) {
      await setCached(cacheKey, symbol, 'financials', result, ttlForType(type));
    }
    return addSecurityHeaders(NextResponse.json({ success: true, data: withFiscal(result, await calendar, period), type, period }));
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Rate limit exceeded' }, { status: 429 })
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (/enterprise plan|higher plan|not available.*plan/i.test(msg)) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'plan_restricted', type, period }, { status: 403 })
      );
    }
    console.error(`[financials] Error for ${symbol} type=${type}:`, err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to fetch financial data' }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
