/**
 * Fetches real, current S&P 500 and Nasdaq-100 constituent lists from public
 * sources, for lib/market-data/sp500.ts and nasdaq100.ts to be kept in sync
 * against (see scripts/sync-index-constituents.ts, run weekly by
 * .github/workflows/cron-sync-index-constituents.yml).
 *
 * TwelveData has no index-constituents endpoint, and S&P Dow Jones Indices'
 * own constituent data is commercially licensed — so this uses two free,
 * officially-sourced alternatives instead of scraping Wikipedia:
 *
 * - S&P 500: State Street's SPY ETF daily holdings file. SPY is a
 *   full-replication S&P 500 tracker, so its legally-mandated daily holdings
 *   disclosure is a same-day mirror of real index membership.
 * - Nasdaq 100: Nasdaq's own public quote-list API for the index it
 *   administers directly — the most authoritative source available.
 */

const SPY_HOLDINGS_URL =
  'https://www.ssga.com/library-content/products/fund-data/etfs/us/holdings-daily-us-en-spy.xlsx';
const NASDAQ100_API_URL = 'https://api.nasdaq.com/api/quote/list-type/nasdaq100';

// SPY's holdings file includes a couple of non-equity rows alongside the 500
// real constituents: a "US DOLLAR" cash line (ticker "-") and, occasionally,
// dust-sized CVR/contingent-payment rows left over from a completed
// acquisition (e.g. ticker "2602335D" for the Hologic CVR). Both use ticker
// strings that don't look like a real symbol, so a strict format filter
// excludes them without needing to special-case by name.
const VALID_TICKER = /^[A-Z]{1,5}(\.[A-Z]{1,2})?$/;

export async function fetchSP500Tickers(): Promise<string[]> {
  const res = await fetch(SPY_HOLDINGS_URL, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BullPenIndexSync/1.0)' },
  });
  if (!res.ok) {
    throw new Error(`SPY holdings fetch failed: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());

  // Lazy import: xlsx is only needed by this sync path, not the app runtime.
  const XLSX = await import('xlsx');
  const wb = XLSX.read(buf, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as string[][];

  // Row 4 (0-indexed) is the header ("Name","Ticker","Identifier",...); data
  // starts at row 5 and runs until the trailing blank rows / legal footer.
  const tickers = new Set<string>();
  for (let i = 5; i < rows.length; i++) {
    const ticker = rows[i]?.[1];
    if (ticker && VALID_TICKER.test(ticker)) {
      tickers.add(ticker);
    }
  }

  if (tickers.size < 450 || tickers.size > 520) {
    throw new Error(
      `SPY holdings parse produced an implausible S&P 500 count (${tickers.size}) — source format may have changed.`
    );
  }

  return [...tickers].sort();
}

export async function fetchNasdaq100Tickers(): Promise<string[]> {
  const res = await fetch(NASDAQ100_API_URL, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; BullPenIndexSync/1.0)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`Nasdaq-100 API fetch failed: ${res.status} ${res.statusText}`);
  }
  const json = (await res.json()) as {
    data?: { data?: { rows?: Array<{ symbol?: string }> } };
  };
  const rows = json.data?.data?.rows ?? [];
  const tickers = new Set<string>();
  for (const row of rows) {
    if (row.symbol && VALID_TICKER.test(row.symbol)) {
      tickers.add(row.symbol);
    }
  }

  // Nasdaq-100 is nominally 100 names but runs slightly over 100 tickers
  // whenever a constituent has dual share classes (GOOGL/GOOG today).
  if (tickers.size < 95 || tickers.size > 110) {
    throw new Error(
      `Nasdaq-100 API parse produced an implausible constituent count (${tickers.size}) — source format may have changed.`
    );
  }

  return [...tickers].sort();
}

export function diffTickers(current: string[], fresh: string[]): { added: string[]; removed: string[] } {
  const currentSet = new Set(current);
  const freshSet = new Set(fresh);
  return {
    added: fresh.filter((t) => !currentSet.has(t)),
    removed: current.filter((t) => !freshSet.has(t)),
  };
}
