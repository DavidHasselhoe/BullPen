import { symbolSearch } from '@/lib/twelvedata/twelvedata-client';
import { isValidIsin } from './isin';
import { rankForImport, cleanSecurityName, isOtcProxy, type ImportCandidate, type ScoredCandidate } from './rank-import-candidates';
import { getQuoteMeta, type QuoteMeta } from './quote-verify';

export interface SecurityToResolve {
  isin: string | null;
  rawSymbol: string | null;
  name: string | null;
  priceCurrency: string | null;
}

export type SecurityResolution =
  | { status: 'resolved'; candidate: ScoredCandidate; quote: QuoteMeta; creditsUsed: number }
  | { status: 'proxy_suggested'; suggestion: ScoredCandidate; quote: QuoteMeta; wanted: ScoredCandidate | null; creditsUsed: number }
  | { status: 'unmatched'; bestGuesses: ScoredCandidate[]; creditsUsed: number };

const VERIFY_TOP_N = 3;

async function searchIsin(isin: string): Promise<ImportCandidate[]> {
  const results = await symbolSearch(isin, 30);
  return results
    .filter((r) => r.symbol.toUpperCase() !== isin.toUpperCase()) // the Wallenius trap: ISIN echoed as symbol
    .map((r) => ({ ...r, provenance: 'isin' as const }));
}

async function searchName(name: string): Promise<ImportCandidate[]> {
  const results = await symbolSearch(name, 40);
  return results.map((r) => ({ ...r, provenance: 'name' as const }));
}

/**
 * Resolves one distinct security to a priceable TwelveData listing.
 * Verification is mandatory and checks BOTH currency and mic_code against
 * the candidate — confirmed necessary live: `getStockQuote('KOG')` (bare,
 * no verification) returns The Kroger Co. on Frankfurt in EUR, not
 * Kongsberg Gruppen. A candidate that resolves but never returns a
 * matching quote (Oslo Børs is dark on this account: XOSL 404s for every
 * symbol tried) falls through to an OTC/ADR proxy suggestion — offered
 * explicitly, never auto-applied, since a proxy is a different instrument
 * with a different share ratio.
 */
export async function resolveSecurity(security: SecurityToResolve): Promise<SecurityResolution> {
  let creditsUsed = 0;
  let candidates: ImportCandidate[] = [];

  if (security.isin && isValidIsin(security.isin)) {
    candidates = await searchIsin(security.isin);
    creditsUsed += 1;
  }

  if (candidates.length === 0 && security.name) {
    candidates = await searchName(cleanSecurityName(security.name));
    creditsUsed += 1;
  }

  if (candidates.length === 0 && security.rawSymbol) {
    candidates = await searchName(security.rawSymbol);
    creditsUsed += 1;
  }

  if (candidates.length === 0) {
    return { status: 'unmatched', bestGuesses: [], creditsUsed };
  }

  const ranked = rankForImport(candidates, {
    priceCurrency: security.priceCurrency,
    rowName: security.name ?? security.rawSymbol,
  });

  for (const candidate of ranked.slice(0, VERIFY_TOP_N)) {
    const quote = await getQuoteMeta(candidate.symbol, candidate.mic_code || undefined);
    creditsUsed += 1;
    if (!quote) continue;
    if (quote.currency && candidate.currency && quote.currency !== candidate.currency) continue;
    return { status: 'resolved', candidate, quote, creditsUsed };
  }

  // Nothing in the home market verified. Look for a US OTC/ADR proxy among
  // the FULL ranked list (not just the top 3, which were ranked for the
  // home market and may have pushed a proxy listing far down).
  const proxyCandidates = ranked.filter(isOtcProxy).slice(0, 2);
  for (const proxy of proxyCandidates) {
    const quote = await getQuoteMeta(proxy.symbol, proxy.mic_code || undefined);
    creditsUsed += 1;
    if (!quote) continue;
    return { status: 'proxy_suggested', suggestion: proxy, quote, wanted: ranked[0] ?? null, creditsUsed };
  }

  return { status: 'unmatched', bestGuesses: ranked.slice(0, 5), creditsUsed };
}
