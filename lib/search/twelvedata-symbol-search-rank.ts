import type { SymbolSearchResult } from '@/lib/twelvedata/twelvedata-client';

/** True if query looks like a ticker or pair (not a company name). */
export function isLikelyTickerQuery(query: string): boolean {
  const t = query.trim();
  if (t.length < 1 || t.length > 12) return false;
  if (/\s/.test(t)) return false;
  // Lowercase → treat as company name ("bitcoin" not ticker "BTC")
  if (/[a-z]/.test(t)) return false;
  // Pair format: BTC/USD, XAU/USD — always treat as ticker-like
  if (/^[A-Z0-9]+-[A-Z]{2,4}$/.test(t) || /^[A-Z0-9]+\/[A-Z]{2,4}$/.test(t)) return true;
  return /^[A-Z0-9][A-Z0-9.-]*$/.test(t);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Query-match tier for a result — lower is more relevant. */
function relevanceTier(r: SymbolSearchResult, qLower: string, qUpper: string): number {
  const sym = r.symbol.toUpperCase();
  const name = r.instrument_name.toLowerCase();
  if (sym === qUpper) return 0;                                       // exact ticker
  if (name === qLower) return 1;                                      // exact company name
  if (name.startsWith(qLower)) return 2;                             // name starts with query
  if (sym.startsWith(qUpper)) return 3;                              // ticker starts with query
  if (new RegExp(`\\b${escapeRegExp(qLower)}`).test(name)) return 4; // query at a word boundary
  if (name.includes(qLower)) return 5;                               // substring anywhere
  return 6;
}

/**
 * Final ordering for search results: query-match relevance first, then
 * popularity (market cap from our tracked universe, when supplied), then listing
 * quality. JS sort is stable, so TwelveData's own order breaks remaining ties.
 *
 * This is why "micron" surfaces Micron Technology (large-cap, in our universe)
 * above Micron Solutions / Ambiq Micro, instead of trusting raw API order.
 */
export function rankByRelevance(
  rows: SymbolSearchResult[],
  query: string,
  popularity?: Map<string, number>,
): SymbolSearchResult[] {
  const qLower = query.toLowerCase().trim();
  const qUpper = query.toUpperCase().trim();
  return [...rows].sort((a, b) => {
    const ta = relevanceTier(a, qLower, qUpper);
    const tb = relevanceTier(b, qLower, qUpper);
    if (ta !== tb) return ta - tb;
    const pa = popularity?.get(a.symbol.toUpperCase()) ?? 0;
    const pb = popularity?.get(b.symbol.toUpperCase()) ?? 0;
    if (pa !== pb) return pb - pa;
    return scoreCandidate(b) - scoreCandidate(a);
  });
}

const US_COUNTRY = new Set(['united states', 'us', 'usa']);

export function isUnitedStatesListing(r: SymbolSearchResult): boolean {
  const c = r.country?.toLowerCase().trim() ?? '';
  return US_COUNTRY.has(c) || c.includes('united states');
}

/** Lower = more preferred (primary US listings). */
function exchangePreferenceRank(exchange: string): number {
  const e = exchange.toUpperCase().trim();
  if (e === 'NASDAQ' || e.includes('NASDAQ')) return 0;
  if (e === 'NYSE' || (e.includes('NYSE') && !e.includes('ARCA') && !e.includes('AMERICAN'))) return 1;
  if (e.includes('NYSE ARCA') || e === 'NYSE ARCA') return 2;
  if (e.includes('AMERICAN') || e === 'AMEX' || e.includes('NYSE MKT')) return 3;
  if (e.includes('BATS')) return 4;
  if (e.includes('OTC')) return 8;
  return 5;
}

function micPreferenceRank(mic: string): number {
  const m = mic.toUpperCase();
  if (m === 'XNAS' || m === 'XNMS' || m === 'XNCM') return 0;
  if (m === 'XNYS') return 1;
  if (m === 'ARCX' || m === 'XASE') return 2;
  return 10;
}

/** Higher score wins within a symbol group. */
function scoreCandidate(r: SymbolSearchResult): number {
  let s = 0;
  if (isUnitedStatesListing(r)) s += 10_000;
  if (r.instrument_type === 'Common Stock') s += 500;
  s += 200 - exchangePreferenceRank(r.exchange) * 20;
  s += 50 - micPreferenceRank(r.mic_code);
  return s;
}

/**
 * TwelveData returns many cross-listings. Keep one row per ticker symbol:
 * prefer US listing, then NASDAQ > NYSE > …, then Common Stock.
 */
export function pickPrimaryListingPerSymbol(
  rows: SymbolSearchResult[],
  symbolOrder: string[]
): SymbolSearchResult[] {
  const best = new Map<string, SymbolSearchResult>();

  for (const r of rows) {
    const sym = r.symbol.toUpperCase();
    const prev = best.get(sym);
    if (!prev || scoreCandidate(r) > scoreCandidate(prev)) {
      best.set(sym, r);
    }
  }

  return symbolOrder
    .map((s) => best.get(s.toUpperCase()))
    .filter((x): x is SymbolSearchResult => x != null);
}

/** First-seen symbol order preserves TwelveData relevance ordering. */
export function symbolOrderFromResults(rows: SymbolSearchResult[]): string[] {
  const order: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const s = r.symbol.toUpperCase();
    if (!seen.has(s)) {
      seen.add(s);
      order.push(s);
    }
  }
  return order;
}

const ETF_INTENT = /^(etf|etfs?|exchange[- ]traded|fund|mutual funds?)$/i;

/**
 * For company-name-style queries, drop ETFs/ETNs so "amazon" does not return JSE ETNs.
 * Ticker-like queries and explicit ETF intent keep ETFs.
 */
export function filterByQueryIntent(
  rows: SymbolSearchResult[],
  query: string
): SymbolSearchResult[] {
  const tickerLike = isLikelyTickerQuery(query);
  const etfIntent = ETF_INTENT.test(query.trim());
  if (tickerLike || etfIntent) return rows;

  return rows.filter((r) => {
    const t = r.instrument_type;
    if (t === 'ETF' || t === 'Exchange-Traded Note') return false;
    return true;
  });
}

// Strip common legal-entity suffixes so "NVIDIA" and "NVIDIA Corporation" collapse together.
const LEGAL_SUFFIXES = /\b(corporation|corp\.?|incorporated|inc\.?|limited|ltd\.?|llc|plc|n\.v\.|s\.a\.|a\.g\.|holdings|co\.?)\b/gi;

function normalizeCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, '')
    .replace(/[.,]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * For company-name queries, drop non-US Common Stock rows when the result set
 * already contains at least one US Common Stock listing.
 * ADR/GDR, ETF, REIT rows are always kept — they are the US-tradeable form of
 * foreign companies and are legitimately US-listed.
 */
const NON_EQUITY_TYPES = new Set([
  'Digital Currency', 'Cryptocurrency', 'Commodity', 'Physical Currency', 'Currency', 'Forex',
]);

export function filterNonUsWhenUsExists(rows: SymbolSearchResult[]): SymbolSearchResult[] {
  const hasUSCommonStock = rows.some(
    (r) => isUnitedStatesListing(r) && r.instrument_type === 'Common Stock'
  );
  if (!hasUSCommonStock) return rows;
  return rows.filter(
    (r) =>
      isUnitedStatesListing(r) ||
      r.instrument_type === 'ADR' ||
      r.instrument_type === 'GDR' ||
      r.instrument_type === 'ETF' ||
      r.instrument_type === 'REIT' ||
      NON_EQUITY_TYPES.has(r.instrument_type)
  );
}

/**
 * One result per company (e.g. "amazon" → single NASDAQ AMZN, not LSE 0R1O + BMV AMZN).
 * Preserves TwelveData relevance order.
 */
export function pickPrimaryPerCompanyName(rows: SymbolSearchResult[]): SymbolSearchResult[] {
  const byName = new Map<string, SymbolSearchResult[]>();
  for (const r of rows) {
    const key = normalizeCompanyName(r.instrument_name);
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(r);
  }

  const winner = new Map<string, SymbolSearchResult>();
  for (const [key, group] of byName) {
    winner.set(key, group.reduce((a, b) => (scoreCandidate(b) > scoreCandidate(a) ? b : a)));
  }

  const seen = new Set<string>();
  const out: SymbolSearchResult[] = [];
  for (const r of rows) {
    const key = normalizeCompanyName(r.instrument_name);
    if (seen.has(key)) continue;
    seen.add(key);
    const w = winner.get(key);
    if (w) out.push(w);
  }
  return out;
}
