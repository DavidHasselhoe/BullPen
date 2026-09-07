/**
 * CUSIP -> ticker resolution for 13F holdings. No CUSIP support exists
 * anywhere else in this repo — this repurposes lib/import/resolve-security.ts's
 * ISIN-based security-resolution pipeline (built for CSV holdings import),
 * since a US CUSIP is trivially convertible to a synthetic US ISIN.
 *
 * Three tiers, cache-first, so steady-state ingestion (after the first full
 * pass across all tracked funds) costs near-zero TwelveData credits — a
 * CUSIP is a stable identifier for a security regardless of which fund
 * holds it, so resolving it once and caching in cusip_ticker_map means
 * every future quarter, and every other fund holding the same security,
 * hits the cache instead of re-resolving:
 *
 *   1. cusip_ticker_map cache hit — zero cost.
 *   2. company_index trigram fuzzy match on the issuer name — zero cost,
 *      matches BullPen's own already-ingested company universe for free.
 *   3. Synthetic-ISIN search through TwelveData (resolveSecurity, reused
 *      unmodified) — costs 1-3 credits, gated by the cron credit budget.
 */

import { createServerClient } from '@/lib/supabase/client';
import { resolveSecurity } from '@/lib/import/resolve-security';
import { tryReserveCredits } from '@/lib/twelvedata/credit-budget';
import type { Raw13FHolding } from './parse-13f-xml';

export interface ResolvedHolding extends Raw13FHolding {
  symbol: string | null;
}

interface CusipMapRow {
  cusip: string;
  symbol: string | null;
}

/** Builds a synthetic US ISIN from a 9-character CUSIP (US ISINs are
 *  "US" + CUSIP + one Luhn mod-10 check digit, per ISO 6166). */
export function cusipToIsin(cusip: string): string {
  const body = `US${cusip.toUpperCase()}`;
  let digits = '';
  for (const ch of body) {
    digits += ch >= 'A' && ch <= 'Z' ? String(ch.charCodeAt(0) - 55) : ch;
  }
  let sum = 0;
  let doubleIt = true; // rightmost digit of the 11-char body is doubled first (check digit itself is appended after)
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (doubleIt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    doubleIt = !doubleIt;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return `${body}${checkDigit}`;
}

/** Trigram similarity threshold above which a company_index name match is
 *  trusted on its own (no paid cross-check). company_index.normalized_name
 *  keeps corporate suffixes (verified live: 'chs inc', not 'chs') — the RPC
 *  handles casing/lowercasing itself, so the raw SEC issuer name is passed
 *  through as-is here, punctuation and all. */
const HIGH_CONFIDENCE_SIMILARITY = 0.8;
const MIN_SIMILARITY = 0.5;

interface CompanyIndexMatch {
  symbol: string;
  companyName: string;
  similarity: number;
}

async function matchCompanyIndex(nameOfIssuer: string): Promise<CompanyIndexMatch | null> {
  const supabase = createServerClient();
  const { data, error } = await supabase.rpc('match_company_index_by_name' as never, {
    query_name: nameOfIssuer,
    min_similarity: MIN_SIMILARITY,
  } as never);
  if (error || !data) return null;
  const row = (data as { ticker: string; name: string; similarity: number }[])[0];
  if (!row) return null;
  return { symbol: row.ticker, companyName: row.name, similarity: row.similarity };
}

/**
 * Resolves every distinct CUSIP in a filing's parsed holdings, batched
 * against the cache first. Stops attempting new TwelveData resolutions (but
 * keeps everything already resolved) if the cron credit budget is exhausted
 * — an unresolved holding is still stored with symbol=NULL, valid,
 * displayable data, and gets picked up by next week's run.
 */
export async function resolveHoldingsForFiling(holdings: Raw13FHolding[]): Promise<ResolvedHolding[]> {
  const supabase = createServerClient();
  const distinctCusips = Array.from(new Set(holdings.map((h) => h.cusip)));

  const { data: cached } = await supabase
    .from('cusip_ticker_map')
    .select('cusip, symbol')
    .in('cusip', distinctCusips);
  const cacheMap = new Map<string, string | null>(
    ((cached as CusipMapRow[] | null) ?? []).map((r) => [r.cusip, r.symbol])
  );

  const misses = distinctCusips.filter((c) => !cacheMap.has(c));
  let budgetExhausted = false;

  for (const cusip of misses) {
    if (budgetExhausted) break;

    const holding = holdings.find((h) => h.cusip === cusip)!;

    // Tier 2: free fuzzy match against BullPen's own company universe. A
    // high-similarity match is trusted directly; a marginal one (0.5-0.8,
    // e.g. an abbreviation like "ALLY FINL INC" -> "Ally Financial Inc." at
    // 0.57 -- verified live) is held as a fallback candidate but still runs
    // through the paid tier as a cross-check rather than being trusted blind.
    const nameMatch = await matchCompanyIndex(holding.nameOfIssuer);
    if (nameMatch && nameMatch.similarity >= HIGH_CONFIDENCE_SIMILARITY) {
      cacheMap.set(cusip, nameMatch.symbol);
      await supabase.from('cusip_ticker_map').upsert({
        cusip,
        symbol: nameMatch.symbol,
        company_name: nameMatch.companyName,
        resolution_method: 'company_index',
        confidence: 'high',
      } as never);
      continue;
    }

    // Tier 3: synthetic-ISIN TwelveData search, gated by the cron credit budget.
    if (!(await tryReserveCredits(3))) {
      // Budget exhausted -- fall back to a marginal tier-2 match rather than
      // leaving this holding fully unresolved, if one exists.
      if (nameMatch) {
        cacheMap.set(cusip, nameMatch.symbol);
        await supabase.from('cusip_ticker_map').upsert({
          cusip, symbol: nameMatch.symbol, company_name: nameMatch.companyName,
          resolution_method: 'company_index', confidence: 'low',
        } as never);
      }
      budgetExhausted = true;
      break;
    }

    const resolution = await resolveSecurity({
      isin: cusipToIsin(cusip),
      rawSymbol: null,
      name: holding.nameOfIssuer,
      priceCurrency: 'USD',
    });

    if (resolution.status === 'resolved') {
      cacheMap.set(cusip, resolution.candidate.symbol);
      await supabase.from('cusip_ticker_map').upsert({
        cusip,
        symbol: resolution.candidate.symbol,
        mic_code: resolution.candidate.mic_code || null,
        currency: resolution.quote.currency || null,
        company_name: resolution.candidate.instrument_name,
        resolution_method: 'isin_search',
        confidence: 'low',
      } as never);
    } else if (nameMatch) {
      // Paid tier came up empty but the marginal free match is still better
      // than nothing -- use it, explicitly marked low-confidence.
      cacheMap.set(cusip, nameMatch.symbol);
      await supabase.from('cusip_ticker_map').upsert({
        cusip, symbol: nameMatch.symbol, company_name: nameMatch.companyName,
        resolution_method: 'company_index', confidence: 'low',
      } as never);
    } else {
      cacheMap.set(cusip, null);
      await supabase.from('cusip_ticker_map').upsert({
        cusip,
        symbol: null,
        resolution_method: 'unresolved',
      } as never);
    }
  }

  return holdings.map((h) => ({ ...h, symbol: cacheMap.get(h.cusip) ?? null }));
}
