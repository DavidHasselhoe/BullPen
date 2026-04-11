import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import {
  getStatistics,
  getIncomeStatement,
  getBalanceSheet,
  getCashFlow,
  TwelveDataRateLimitError,
} from '@/lib/twelvedata/twelvedata-client';
import { computeHealthScore } from '@/lib/finance/health-score';

async function handler(
  _request: NextRequest,
  context: { params: Promise<{ ticker: string }> },
  _session: { userId: string }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  const symbol = ticker.toUpperCase();

  try {
    // Fetch all required data in parallel — each function uses its own server cache
    const [stats, income, balance, cashflow] = await Promise.all([
      getStatistics(symbol),
      getIncomeStatement(symbol, 'quarterly').catch(() => []),
      getBalanceSheet(symbol, 'quarterly').catch(() => []),
      getCashFlow(symbol, 'quarterly').catch(() => []),
    ]);

    const healthScore = computeHealthScore(stats, income, balance, cashflow);

    return addSecurityHeaders(
      NextResponse.json(
        { success: true, data: healthScore },
        { headers: { 'Cache-Control': 'private, max-age=3600' } }
      )
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'Rate limit exceeded' }, { status: 429 })
      );
    }
    const msg = err instanceof Error ? err.message : String(err);
    if (/enterprise plan|higher plan|not available.*plan/i.test(msg)) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 403 })
      );
    }
    console.error(`[health-score] Error for ${symbol}:`, err);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Failed to compute health score' }, { status: 500 })
    );
  }
}

export const GET = withRateLimit(withAuth(handler), { windowMs: 60 * 1000, maxRequests: 30 });
