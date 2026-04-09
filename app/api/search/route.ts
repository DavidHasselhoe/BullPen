import { NextRequest, NextResponse } from 'next/server';
import { symbolSearch } from '@/lib/twelvedata/twelvedata-client';
import {
  filterByQueryIntent,
  isLikelyTickerQuery,
  pickPrimaryListingPerSymbol,
  pickPrimaryPerCompanyName,
  symbolOrderFromResults,
} from '@/lib/search/twelvedata-symbol-search-rank';
import { withRateLimit, addSecurityHeaders, validateSearchQueryParam } from '@/lib/security/api-security';
import { validateLimit } from '@/lib/security/input-validation';
import { logger } from '@/lib/utils/logger';

// Instrument types we consider relevant for a stock-focused app
const RELEVANT_TYPES = new Set([
  'Common Stock',
  'ETF',
  'ADR',
  'GDR',
  'REIT',
  'Preferred Stock',
  'Closed-end Fund',
  'Exchange-Traded Note',
  'Unit',
]);

async function handler(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const q = searchParams.get('q');
    const limitParam = searchParams.get('limit');

    const queryValidation = validateSearchQueryParam(q);
    if (!queryValidation.valid) {
      return NextResponse.json(
        { success: false, error: queryValidation.error || 'Invalid search query' },
        { status: 400 }
      );
    }

    const limit = validateLimit(limitParam, 30, 15);

    if (!queryValidation.sanitized || queryValidation.sanitized.trim().length === 0) {
      return addSecurityHeaders(NextResponse.json({ success: true, results: [] }));
    }

    const q = queryValidation.sanitized.trim();

    // Fetch extra matches: TwelveData returns many cross-listings per company; we collapse to one primary per ticker.
    const raw = await symbolSearch(q, Math.min(120, Math.max(limit * 4, 40)));

    let filtered = raw.filter((r) => RELEVANT_TYPES.has(r.instrument_type));
    filtered = filterByQueryIntent(filtered, q);

    // symbol_search has no request filter for exchange/country (docs: symbol, outputsize, show_plan only).
    // Collapse cross-listings: name queries → one row per company (US/NASDAQ preferred); ticker queries → one per symbol.
    const collapsed = isLikelyTickerQuery(q)
      ? pickPrimaryListingPerSymbol(filtered, symbolOrderFromResults(filtered))
      : pickPrimaryPerCompanyName(filtered);

    const capped = collapsed.slice(0, limit);

    const results = capped.map((r) => ({
      ticker:          r.symbol,
      name:            r.instrument_name,
      exchange:        r.exchange,
      country:         r.country,
      currency:        r.currency,
      instrument_type: r.instrument_type,
      // Kept for backward-compat with consumers that check these fields
      has_data: true,
      cik: '',
      logo_url: null,
    }));

    return addSecurityHeaders(
      NextResponse.json({ success: true, results })
    );
  } catch (error) {
    logger.error('Symbol search error', error);
    return addSecurityHeaders(
      NextResponse.json({ success: false, error: 'Search failed' }, { status: 500 })
    );
  }
}

// 100 req/min — each request costs 1 TwelveData credit
export const GET = withRateLimit(handler, { windowMs: 60_000, maxRequests: 100 });
