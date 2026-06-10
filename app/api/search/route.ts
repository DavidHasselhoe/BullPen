import { NextRequest, NextResponse } from 'next/server';
import { symbolSearch } from '@/lib/twelvedata/twelvedata-client';
import {
  filterByQueryIntent,
  filterNonUsWhenUsExists,
  isLikelyTickerQuery,
  pickPrimaryListingPerSymbol,
  pickPrimaryPerCompanyName,
  rankByRelevance,
  symbolOrderFromResults,
} from '@/lib/search/twelvedata-symbol-search-rank';
import { withRateLimit, addSecurityHeaders, validateSearchQueryParam } from '@/lib/security/api-security';
import { validateLimit } from '@/lib/security/input-validation';
import { logger } from '@/lib/utils/logger';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { createServerClient } from '@/lib/supabase/client';

const SEARCH_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * Market cap per ticker from our tracked universe — used as the "popularity"
 * signal so the most significant stock ranks first within a relevance tier.
 * One indexed query per uncached search; misses just rank as 0 (last in tier).
 */
async function marketCapMap(symbols: string[]): Promise<Map<string, number>> {
  const uniq = [...new Set(symbols.map((s) => s.toUpperCase()))];
  if (uniq.length === 0) return new Map();
  try {
    const supabase = createServerClient();
    const { data } = await supabase
      .from('screener_stats')
      .select('ticker, market_cap')
      .in('ticker', uniq);
    return new Map(
      (data ?? []).map((r) => [
        (r as { ticker: string }).ticker.toUpperCase(),
        Number((r as { market_cap: number | null }).market_cap) || 0,
      ])
    );
  } catch {
    return new Map();
  }
}

// Instrument types we consider relevant
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
  // Crypto & commodity
  'Digital Currency',
  'Cryptocurrency',
  'Commodity',
  'Physical Currency',
]);

async function handler(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const qParam = searchParams.get('q');
    const limitParam = searchParams.get('limit');

    const queryValidation = validateSearchQueryParam(qParam);
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

    const query = queryValidation.sanitized.trim();
    const searchCacheKey = `search:${query.toLowerCase()}`;

    type SearchResult = { ticker: string; name: string; exchange: string; country: string; currency: string; instrument_type: string; has_data: boolean; cik: string; logo_url: null };
    const cachedResults = await getCached<SearchResult[]>(searchCacheKey);
    if (cachedResults) {
      return addSecurityHeaders(NextResponse.json({ success: true, results: cachedResults.slice(0, limit) }));
    }

    // Fetch extra matches: TwelveData returns many cross-listings per company; we collapse to one primary per ticker.
    const raw = await symbolSearch(query, Math.min(120, Math.max(limit * 4, 40)));

    let filtered = raw.filter((r) => RELEVANT_TYPES.has(r.instrument_type));
    filtered = filterByQueryIntent(filtered, query);

    const tickerQuery = isLikelyTickerQuery(query);

    // Drop derivative/certificate symbols (4NVDA, 4ORCL, etc. on MTA) and numeric
    // bond identifiers that TwelveData returns for company-name searches.
    // Ticker-like queries (e.g. "4NVDA" typed explicitly) are left untouched.
    if (!tickerQuery) {
      filtered = filtered.filter((r) => !/^\d/.test(r.symbol));
    }

    // symbol_search has no request filter for exchange/country (docs: symbol, outputsize, show_plan only).
    // Collapse cross-listings: name queries → one row per company (US/NASDAQ preferred); ticker queries → one per symbol.
    let collapsed = tickerQuery
      ? pickPrimaryListingPerSymbol(filtered, symbolOrderFromResults(filtered))
      : pickPrimaryPerCompanyName(filtered);

    // For name queries, drop non-US common stocks when a US listing already exists.
    // Keeps ADR/GDR/ETF/REIT regardless — those are US-tradeable foreign instruments.
    if (!tickerQuery) {
      collapsed = filterNonUsWhenUsExists(collapsed);
    }

    // Re-rank by query relevance, then popularity (market cap from our universe),
    // so the most relevant/significant match leads (e.g. Micron Technology before
    // Micron Solutions). Applies to every search since all go through this route.
    const popularity = await marketCapMap(collapsed.map((r) => r.symbol));
    collapsed = rankByRelevance(collapsed, query, popularity);

    // Build up to 30 results for cache; caller gets `limit` items
    const allResults = collapsed.slice(0, 30).map((r) => ({
      ticker:          r.symbol,
      name:            r.instrument_name,
      exchange:        r.exchange,
      country:         r.country,
      currency:        r.currency,
      instrument_type: r.instrument_type,
      has_data: true,
      cik: '',
      logo_url: null,
    }));

    void setCached(searchCacheKey, query, 'search', allResults, SEARCH_TTL_SECONDS);

    return addSecurityHeaders(
      NextResponse.json({ success: true, results: allResults.slice(0, limit) })
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
