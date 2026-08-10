import { createServerClient } from '@/lib/supabase/client';
import { getCached, setCached } from '@/lib/cache/market-data-cache';
import { getLogoManifest, logoUrlFromManifest } from '@/lib/logos/logo-manifest';

interface MarketCapRow {
  ticker: string;
  market_cap: number | null;
  name: string | null;
}

const UNIVERSE_MAP_KEY = 'screener-universe-meta-map';
const UNIVERSE_MAP_TTL = 6 * 60 * 60;

/** Compact wire shape for the cached map: [market_cap, name] per ticker. */
type UniverseMetaRow = [number | null, string | null];

/**
 * Whole-universe market-cap + name map, cached 6h.
 *
 * Replaces the previous per-request `.in('ticker', symbols)`. That was fine
 * while the calendar returned ~2 rows, but the per-day data fix pushes a month
 * view to 1,000-2,500 unique symbols, which PostgREST receives as a single
 * 15-30 KB query string — at or past the URL-length ceiling. Loading the whole
 * ~1,200-row universe once is one bounded query regardless of range, and it is
 * smaller over the wire than the query string it replaces.
 */
async function getUniverseMetaMap(): Promise<Map<string, UniverseMetaRow>> {
  const cached = await getCached<Record<string, UniverseMetaRow>>(UNIVERSE_MAP_KEY);
  if (cached) return new Map(Object.entries(cached));

  const supabase = createServerClient();
  const { data } = await supabase
    .from('screener_stats')
    .select('ticker, market_cap, name')
    .returns<MarketCapRow[]>();

  const obj: Record<string, UniverseMetaRow> = {};
  for (const row of data ?? []) {
    obj[row.ticker.toUpperCase()] = [row.market_cap, row.name];
  }

  if (Object.keys(obj).length > 0) {
    void setCached(UNIVERSE_MAP_KEY, '_market', 'universe_meta_map', obj, UNIVERSE_MAP_TTL);
  }
  return new Map(Object.entries(obj));
}

export interface CalendarMeta {
  market_cap: number | null;
  /** Direct public storage URL, or null when no bucket object exists (see logo-manifest). */
  logo_url: string | null;
}

/**
 * Attaches market cap + a ready-to-render logo URL to calendar rows.
 *
 * Both lookups are cached maps resolved in parallel and joined in memory, so
 * the cost is independent of how many rows are being enriched. A ticker the
 * screener has never seen (a pre-IPO company) resolves to null rather than
 * failing the batch; rows with an empty `symbol` (some pre-ticker IPO entries)
 * resolve to null too.
 *
 * `name` is backfilled from screener_stats only when the provider omitted it —
 * /dividends_calendar and /splits_calendar return no company name at all.
 */
export async function attachCalendarMeta<T extends { symbol: string; name?: string }>(
  items: T[]
): Promise<(T & CalendarMeta)[]> {
  if (items.length === 0) return [];

  const [metaMap, logoManifest] = await Promise.all([getUniverseMetaMap(), getLogoManifest()]);

  return items.map((item) => {
    const sym = item.symbol ? item.symbol.toUpperCase() : '';
    const meta = sym ? metaMap.get(sym) : undefined;
    return {
      ...item,
      name: item.name || meta?.[1] || undefined,
      market_cap: meta?.[0] ?? null,
      logo_url: sym ? logoUrlFromManifest(logoManifest, sym) : null,
    };
  });
}

/**
 * Market cap only. Kept as a thin wrapper so existing callers that don't want
 * logo/name enrichment (lib/instagram/content/earnings-calendar.ts) are
 * unaffected by the shape change.
 */
export async function attachMarketCap<T extends { symbol: string }>(
  items: T[]
): Promise<(T & { market_cap: number | null })[]> {
  if (items.length === 0) return [];
  const metaMap = await getUniverseMetaMap();
  return items.map((item) => ({
    ...item,
    market_cap: item.symbol ? (metaMap.get(item.symbol.toUpperCase())?.[0] ?? null) : null,
  }));
}
