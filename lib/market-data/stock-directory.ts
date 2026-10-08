/**
 * Every crawlable stock page (S&P 500 + Nasdaq 100), grouped by sector and
 * ordered by market cap. Feeds /stocks and the sector row under each stock
 * page: the only server-rendered links to /stock/* anywhere. Before them,
 * Google found the 519 stock pages through the sitemap alone and queued them
 * as "Discovered, currently not indexed" (Search Console, 2026-10-08).
 */

import { createServerClient } from '@/lib/supabase/client';
import { normalizeSector } from '@/lib/finance/sector-benchmarks';
import { SECTOR_DISPLAY_ORDER } from '@/lib/discover/discover-config';
import { SIGNIFICANT_TICKERS } from './significant-tickers';
import { getDisplayNames } from './display-names';

export interface DirectoryStock {
  ticker: string;
  name: string;
}

export interface DirectorySector {
  /** Discover's sector key, also the anchor on /stocks. */
  key: string;
  label: string;
  tagline: string;
  stocks: DirectoryStock[];
}

// screener_stats speaks Yahoo's sector names; Discover's chart, which users
// see first, says "Consumer Discretionary", so the directory does too.
const KEY_BY_SECTOR: Record<string, string> = {
  Technology: 'technology',
  'Communication Services': 'communications',
  'Consumer Cyclical': 'consumer-discretionary',
  'Financial Services': 'financials',
  Healthcare: 'healthcare',
  Industrials: 'industrials',
  'Consumer Defensive': 'consumer-staples',
  Energy: 'energy',
  Utilities: 'utilities',
  'Real Estate': 'real-estate',
  'Basic Materials': 'materials',
};

const OTHER: Omit<DirectorySector, 'stocks'> = { key: 'other', label: 'Other', tagline: 'Not yet classified' };

// Index membership changes weekly at most; one build per instance per 6h.
const TTL_MS = 6 * 60 * 60 * 1000;
let memo: { at: number; value: DirectorySector[] } | null = null;

export async function getStockDirectory(): Promise<DirectorySector[]> {
  if (memo && Date.now() - memo.at < TTL_MS) return memo.value;

  const tickers = [...SIGNIFICANT_TICKERS];
  const db = createServerClient();
  const [{ data, error }, names] = await Promise.all([
    // ~520 tickers, one row each: under PostgREST's 1000-row cap.
    db
      .from('screener_stats')
      .select('ticker, sector, market_cap')
      .in('ticker', tickers)
      .returns<Array<{ ticker: string; sector: string | null; market_cap: number | null }>>(),
    getDisplayNames(tickers),
  ]);
  if (error) throw error;

  const stats = new Map((data ?? []).map((r) => [r.ticker, r]));
  const bySector = new Map<string, Array<DirectoryStock & { cap: number }>>();
  for (const ticker of tickers) {
    const row = stats.get(ticker);
    // No sector yet still gets listed: every page needs a link to it.
    const key = KEY_BY_SECTOR[normalizeSector(row?.sector) ?? ''] ?? OTHER.key;
    const list = bySector.get(key) ?? [];
    list.push({ ticker, name: names.get(ticker) ?? ticker, cap: row?.market_cap ?? 0 });
    bySector.set(key, list);
  }

  const value = [...SECTOR_DISPLAY_ORDER, OTHER]
    .filter((s) => bySector.has(s.key))
    .map((s) => ({
      key: s.key,
      label: s.label,
      tagline: s.tagline,
      stocks: bySector
        .get(s.key)!
        .sort((a, b) => b.cap - a.cap)
        .map(({ ticker, name }) => ({ ticker, name })),
    }));

  memo = { at: Date.now(), value };
  return value;
}

/**
 * Up to `limit` companies from the same sector, nearest in size: a mid-cap's
 * row shows other mid-caps, not the same twelve giants on every page, so the
 * links spread across the whole sector instead of piling onto its top names.
 */
export async function getSectorPeers(
  ticker: string,
  limit = 12,
): Promise<{ sector: Omit<DirectorySector, 'stocks'>; peers: DirectoryStock[] } | null> {
  const upper = ticker.toUpperCase();
  if (!SIGNIFICANT_TICKERS.has(upper)) return null;
  const directory = await getStockDirectory();
  const sector = directory.find((s) => s.stocks.some((x) => x.ticker === upper));
  if (!sector) return null;

  const others = sector.stocks.filter((x) => x.ticker !== upper);
  const at = sector.stocks.findIndex((x) => x.ticker === upper);
  const start = Math.max(0, Math.min(at - Math.floor(limit / 2), others.length - limit));
  return {
    sector: { key: sector.key, label: sector.label, tagline: sector.tagline },
    peers: others.slice(start, start + limit),
  };
}
