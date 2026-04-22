import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { checkAndInvalidateFundamentals } from '@/lib/cache/fundamentals-freshness';

/**
 * GET /api/stock/[ticker]/freshness
 *
 * Lightweight endpoint called fire-and-forget from the stock detail page.
 * Uses TwelveData /fundamentals/last_changes (1 credit, throttled to 1×/hour/company)
 * to expire any stale cache entries so the next component request fetches fresh data.
 *
 * Never blocks the page render — the client calls this without awaiting the result.
 */
async function handler(
  _request: NextRequest,
  context: { params: Promise<{ ticker: string }> },
  _session: { userId: string }
): Promise<NextResponse> {
  const { ticker } = await context.params;
  const symbol = ticker.toUpperCase();

  const result = await checkAndInvalidateFundamentals(symbol);

  return addSecurityHeaders(
    NextResponse.json({
      symbol,
      ...result,
    })
  );
}

// Generous rate limit — this is called once per page load, fire-and-forget
export const GET = withRateLimit(withAuth(handler), { windowMs: 60 * 1000, maxRequests: 60 });
