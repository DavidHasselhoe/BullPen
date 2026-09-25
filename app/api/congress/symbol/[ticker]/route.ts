/**
 * GET /api/congress/symbol/[ticker]
 *
 * Tracked politicians' disclosed trades in one stock over the last 12 months,
 * for the stock page's Washington activity card. Public and free on purpose:
 * the disclosures are public records (see migration 149). Reads stored rows
 * only, no vendor call; CDN-cached because the data changes once a week.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withRateLimit, addSecurityHeaders } from '@/lib/security/api-security';
import { getTradesForSymbols } from '@/lib/congress/insights';
import { slugToSymbol } from '@/lib/assets/asset-type';

async function handler(_request: NextRequest, context?: unknown) {
  const { params } = (context ?? {}) as { params: Promise<{ ticker: string }> };
  const symbol = slugToSymbol((await params).ticker).toUpperCase();
  try {
    const trades = await getTradesForSymbols([symbol], 365, 50);
    const res = NextResponse.json({ success: true, symbol, trades });
    res.headers.set('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return addSecurityHeaders(res);
  } catch {
    return addSecurityHeaders(NextResponse.json({ success: false, error: 'Failed to load' }, { status: 500 }));
  }
}

export const GET = withRateLimit(handler, { windowMs: 60 * 1000, maxRequests: 60 });
