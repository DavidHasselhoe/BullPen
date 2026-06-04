import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import {
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow,
  getDividends,
  getSplits,
  TwelveDataRateLimitError,
} from '@/lib/twelvedata/twelvedata-client';

type FinancialType = 'income' | 'balance' | 'cashflow' | 'dividends' | 'splits';
type Period = 'quarterly' | 'annual';

// Splits are announced weeks ahead and happen rarely (years apart for most stocks).
// Everything else updates quarterly, so 24h is fine.
function ttlForType(type: FinancialType): number {
  if (type === 'splits') return 30 * 24 * 60 * 60;
  return 24 * 60 * 60;
}

async function handler(
  request: NextRequest,
  context: { params: Promise<{ ticker: string }> },
  _session: { userId: string }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  const symbol = ticker.toUpperCase();
  const { searchParams } = new URL(request.url);
  const type = (searchParams.get('type') ?? 'income') as FinancialType;
  const period = (searchParams.get('period') ?? 'quarterly') as Period;
  const cacheKey = `financials:${symbol}:${type}:${period}`;

  try {
    const cached = await getCached<unknown>(cacheKey);
    if (cached) {
      return addSecurityHeaders(NextResponse.json({ success: true, data: cached, type, period }));
    }

    let result;
    switch (type) {
      case 'income':
        result = await getIncomeStatement(symbol, period);
        break;
      case 'balance':
        result = await getBalanceSheet(symbol, period);
        break;
      case 'cashflow':
        result = await getCashFlow(symbol, period);
        break;
      case 'dividends':
        result = await getDividends(symbol);
        break;
      case 'splits':
        result = await getSplits(symbol);
        break;
      default:
        return addSecurityHeaders(
          NextResponse.json({ success: false, error: 'Invalid type' }, { status: 400 })
        );
    }

    await setCached(cacheKey, symbol, 'financials', result, ttlForType(type));
    return addSecurityHeaders(NextResponse.json({ success: true, data: result, type, period }));
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

export const GET = withRateLimit(withAuth(handler), { windowMs: 60 * 1000, maxRequests: 60 });
