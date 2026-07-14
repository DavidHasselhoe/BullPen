import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { getHealthScoreForSymbol } from '@/lib/finance/get-health-score';

async function handler(
  _request: NextRequest,
  context: { params: Promise<{ ticker: string }> },
  _session: { userId: string }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  const symbol = ticker.toUpperCase();

  try {
    const { healthScore, degraded } = await getHealthScoreForSymbol(symbol);

    // A degraded computation (one or more statement fetches failed even after retry)
    // must not be cached — caching it would pin an incomplete/N-A score in the client's
    // HTTP cache for an hour even after the underlying data becomes available on a
    // later request (e.g. once /financials repopulates the shared cache on refresh).
    return addSecurityHeaders(
      NextResponse.json(
        { success: true, data: healthScore },
        { headers: { 'Cache-Control': degraded ? 'private, no-store' : 'private, max-age=3600' } }
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
