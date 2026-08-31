import type { SymbolSearchResult } from '@/lib/twelvedata/twelvedata-client';

export type CandidateProvenance = 'isin' | 'name';

export interface ImportCandidate extends SymbolSearchResult {
  provenance: CandidateProvenance;
}

export interface ScoredCandidate extends ImportCandidate {
  score: number;
}

const LEGAL_SUFFIXES = /\b(asa|oyj|ab|a\/s|n\.?v\.?|se|plc|inc\.?|corp\.?|corporation|co\.?|ltd\.?|llc)\b/gi;
const FUND_CLASS_SUFFIX = /\s+(ser\.?\s*[a-z]|acc|dist|[a-z])$/i;

/** Strips legal-entity suffixes and fund share-class markers so a name like
 *  "Kongsberg Gruppen ASA" or "DNB Global Indeks A" matches TwelveData's
 *  own instrument_name more reliably. */
export function cleanSecurityName(raw: string): string {
  return raw
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(FUND_CLASS_SUFFIX, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function nameOverlapRatio(a: string, b: string): number {
  const tokenize = (s: string) => new Set(s.toLowerCase().split(/\s+/).filter((t) => t.length > 1));
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  return overlap / Math.max(ta.size, tb.size);
}

const OTC_MIC_CODES = new Set(['PINX', 'OTCQ', 'OTCM']);
/** NASDAQ/NYSE family — a small tie-breaking preference, not the dominant
 *  +10,000 bias in lib/search/twelvedata-symbol-search-rank.ts. Confirmed
 *  necessary live: without it, a USD-denominated minor European
 *  cross-listing (e.g. Alphabet's "0RIH" on LSE) can out-rank the real
 *  NASDAQ ticker (GOOGL) purely because "0RIH" is one character shorter.
 *  This only breaks ties among currency-matched candidates — it never
 *  overrides the currency signal itself. */
const MAJOR_US_MIC_CODES = new Set(['XNGS', 'XNMS', 'XNCM', 'XNYS']);

/**
 * Ranks candidates for IMPORT resolution — deliberately the inverse of
 * lib/search/twelvedata-symbol-search-rank.ts's scoreCandidate, which
 * gives US listings a +10,000 bonus. That's correct for the app's search
 * box (most searches are for US names) and wrong here: a Norwegian user's
 * row tells us its real trading currency, and a candidate that matches it
 * is almost always the right listing — a US bonus would actively steer
 * import resolution toward the wrong market.
 */
export function rankForImport(
  candidates: ImportCandidate[],
  opts: { priceCurrency?: string | null; isinCountryHint?: string | null; rowName?: string | null }
): ScoredCandidate[] {
  const scored = candidates.map((c): ScoredCandidate => {
    let score = 0;
    if (opts.priceCurrency && c.currency === opts.priceCurrency) score += 5000;
    if (c.provenance === 'isin') score += 2000;
    if (c.instrument_type === 'Common Stock') score += 1200;
    if (
      (c.instrument_type === 'Mutual Fund' || c.instrument_type === 'ETF') &&
      opts.rowName &&
      /fund|indeks|index|etf/i.test(opts.rowName)
    ) {
      score += 1000;
    }
    if (opts.rowName) {
      score += Math.round(nameOverlapRatio(cleanSecurityName(opts.rowName), c.instrument_name) * 400);
    }
    if (MAJOR_US_MIC_CODES.has(c.mic_code)) score += 300;
    score += Math.max(0, 50 - c.symbol.length * 3); // minor tie-break: shorter symbol
    if (OTC_MIC_CODES.has(c.mic_code)) score -= 1500;
    if (c.symbol.toUpperCase() === c.symbol && /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(c.symbol)) score -= 2000; // ISIN echoed as symbol
    if (opts.priceCurrency && c.currency !== opts.priceCurrency) score -= 3000;
    return { ...c, score };
  });

  return scored.sort((a, b) => b.score - a.score);
}

export function isOtcProxy(c: { mic_code: string }): boolean {
  return OTC_MIC_CODES.has(c.mic_code);
}
