import { getCached, setCached } from '@/lib/cache/market-data-cache';

/**
 * Ticker to SEC CIK, from SEC's own published map.
 *
 * The whole file is ~800KB and covers every US filer, so it is fetched once
 * and cached for a week rather than queried per ticker. The local `companies`
 * table holds 39 hand-seeded rows and is not a substitute.
 */

const MAP_KEY = 'sec:ticker-cik-map';
const MAP_TTL_SEC = 7 * 24 * 60 * 60;

function userAgent(): string {
  return process.env.SEC_EDGAR_USER_AGENT || 'BullPen contact@bullpen.no';
}

async function loadMap(): Promise<Record<string, string>> {
  const cached = await getCached<Record<string, string>>(MAP_KEY);
  if (cached) return cached;

  const res = await fetch('https://www.sec.gov/files/company_tickers.json', {
    headers: { 'User-Agent': userAgent(), Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`SEC ticker map ${res.status}`);

  const raw = (await res.json()) as Record<string, { cik_str: number; ticker: string }>;
  const map: Record<string, string> = {};
  for (const row of Object.values(raw)) {
    if (row?.ticker) map[row.ticker.toUpperCase()] = String(row.cik_str).padStart(10, '0');
  }

  void setCached(MAP_KEY, 'sec', 'cik-map', map, MAP_TTL_SEC);
  return map;
}

export async function resolveCik(ticker: string): Promise<string | null> {
  try {
    const map = await loadMap();
    return map[ticker.trim().toUpperCase()] ?? null;
  } catch {
    return null;
  }
}
