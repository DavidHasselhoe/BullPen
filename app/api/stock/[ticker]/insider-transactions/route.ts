import { NextRequest, NextResponse } from 'next/server';
import { getInsiderTransactions, TwelveDataRateLimitError } from '@/lib/twelvedata/twelvedata-client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { getTier, isPro } from '@/lib/billing/tier';

// Form 4 filings are due within 2 business days but insider trading windows
// only open after earnings (~quarterly), so meaningful new data arrives at most
// a few times a year. 7 days balances freshness with the 200-credit cost.
const INSIDER_TTL_SECONDS = 7 * 24 * 60 * 60;

async function handler(
  _request: NextRequest,
  { params }: { params: Promise<{ ticker: string }> },
  session: { userId: string }
) {
  // Pro-only — also the single most expensive TwelveData endpoint in the app
  // (200 credits/symbol), so this gate matters for both the paywall and cost control.
  if (!isPro(await getTier(session.userId))) {
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'upgrade_required' }, { status: 403 })
    );
  }

  const { ticker } = await params;
  const symbol = ticker.toUpperCase();
  const cacheKey = `insider:${symbol}`;

  try {
    const cached = await getCached<Awaited<ReturnType<typeof getInsiderTransactions>>>(cacheKey);
    if (cached) {
      return addSecurityHeaders(
        NextResponse.json(
          { success: true, data: cached },
          { headers: { 'Cache-Control': 'private, max-age=3600' } }
        )
      );
    }

    const transactions = await getInsiderTransactions(symbol);
    await setCached(cacheKey, symbol, 'insider_transactions', transactions, INSIDER_TTL_SECONDS);
    return addSecurityHeaders(
      NextResponse.json(
        { success: true, data: transactions },
        { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' } }
      )
    );
  } catch (err) {
    if (err instanceof TwelveDataRateLimitError) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'rate_limited' }, { status: 429 })
      );
    }
    const msg = err instanceof Error ? err.message : 'Unknown error';
    // Gracefully return empty data for plan restriction errors
    if (/plan|enterprise|forbidden|403/i.test(msg)) {
      return addSecurityHeaders(
        NextResponse.json({ success: false, error: 'plan_restricted' }, { status: 200 })
      );
    }
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: msg }, { status: 500 })
    );
  }
}

export const GET = withAuth(handler, { rateLimit: { windowMs: 60_000, maxRequests: 30 } });
