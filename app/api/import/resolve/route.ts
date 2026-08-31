/**
 * GET /api/import/resolve?q=<query>
 *   Search-only, import-ranked candidates for the review grid's manual fix
 *   picker — cheap (1 TwelveData credit), NOT quote-verified, safe to call
 *   on every keystroke (debounced client-side).
 *
 * GET /api/import/resolve?symbol=<symbol>&micCode=<mic>&currency=<cur>
 *   Verifies ONE specific candidate the user selected from that list —
 *   this is a single deliberate action, not a per-keystroke call, so the
 *   extra credit for a real quote check is worth it before accepting a
 *   manual pick into the import.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withAuth, addSecurityHeaders } from '@/lib/security/api-security';
import { checkRateLimit } from '@/lib/security/rate-limiter';
import { symbolSearch } from '@/lib/twelvedata/twelvedata-client';
import { rankForImport, type ImportCandidate } from '@/lib/import/rank-import-candidates';
import { getQuoteMeta } from '@/lib/import/quote-verify';

async function handler(request: NextRequest, _ctx: unknown, session: { userId: string }): Promise<NextResponse> {
  const limit = await checkRateLimit(`import-resolve:${session.userId}`, { windowMs: 60_000, maxRequests: 30 });
  if (!limit.allowed) {
    return addSecurityHeaders(NextResponse.json({ error: 'Too many searches. Please slow down.' }, { status: 429 }));
  }

  const { searchParams } = request.nextUrl;
  const symbol = searchParams.get('symbol');

  if (symbol) {
    const micCode = searchParams.get('micCode') || undefined;
    const expectedCurrency = searchParams.get('currency') || null;
    const quote = await getQuoteMeta(symbol, micCode);
    if (!quote) {
      return addSecurityHeaders(NextResponse.json({ status: 'unmatched' }));
    }
    if (expectedCurrency && quote.currency && quote.currency !== expectedCurrency) {
      return addSecurityHeaders(NextResponse.json({ status: 'unmatched', reason: 'currency_mismatch' }));
    }
    return addSecurityHeaders(NextResponse.json({ status: 'resolved', quote }));
  }

  const q = searchParams.get('q')?.trim();
  if (!q || q.length < 1) {
    return addSecurityHeaders(NextResponse.json({ candidates: [] }));
  }

  try {
    const results = await symbolSearch(q, 20);
    const candidates: ImportCandidate[] = results.map((r) => ({ ...r, provenance: 'name' as const }));
    const ranked = rankForImport(candidates, { rowName: q });
    return addSecurityHeaders(NextResponse.json({ candidates: ranked.slice(0, 10) }));
  } catch (err) {
    console.error('[import/resolve] search failed:', err);
    return addSecurityHeaders(NextResponse.json({ candidates: [] }));
  }
}

export const GET = withAuth(handler);
