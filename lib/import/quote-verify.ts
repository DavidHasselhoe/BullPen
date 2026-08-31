/**
 * A dedicated, minimal `/quote` fetcher for import resolution — deliberately
 * NOT reusing `getStockQuote`/`parseQuoteResponse` from
 * lib/twelvedata/twelvedata-client.ts, which many other features depend on
 * and whose Finnhub-compatible {c,d,dp,h,l,o,pc,t} shape throws away
 * exactly the fields (currency, mic_code, exchange, name) verification
 * needs. Modifying that shared parser to add them back risks regressing
 * everything else that calls it; a small standalone fetcher here does not.
 *
 * Confirmed live against the real TwelveData account this app uses:
 * `mic_code` IS honored as a filter (MSFT + XNGS works, NOKIA + XHEL 404s
 * because Helsinki isn't covered on this plan) — but a symbol+mic_code
 * combination that doesn't exist on `/quote` returns a generic
 * "symbol or figi parameter is missing or invalid" 404, which reads like a
 * malformed request but actually means "no listing here." Callers must
 * treat that 404 as "not quotable with this mic_code," not as an error.
 */

export interface QuoteMeta {
  symbol: string;
  name: string;
  exchange: string;
  micCode: string;
  currency: string;
  close: number;
}

function apiKey(): string {
  const key = process.env.TWELVE_DATA_API_KEY;
  if (!key) throw new Error('TWELVE_DATA_API_KEY is not configured.');
  return key;
}

/** Returns null (never throws) when the symbol/mic_code combination isn't
 *  quotable — that is an expected, common outcome during resolution, not
 *  an error condition. Throws only on a genuine transport/rate-limit issue. */
export async function getQuoteMeta(symbol: string, micCode?: string): Promise<QuoteMeta | null> {
  const params = new URLSearchParams({ symbol: symbol.toUpperCase(), apikey: apiKey() });
  if (micCode) params.set('mic_code', micCode);

  const res = await fetch(`https://api.twelvedata.com/quote?${params.toString()}`);
  const data = (await res.json()) as Record<string, unknown>;

  if (data.status === 'error' || data.code) {
    const code = Number(data.code);
    if (code === 404 || code === 400) return null; // not found / invalid combination
    if (code === 429) throw new Error(`TwelveData rate limited: ${data.message}`);
    return null;
  }
  if (typeof data.close !== 'string' && typeof data.close !== 'number') return null;

  return {
    symbol: String(data.symbol ?? symbol),
    name: String(data.name ?? ''),
    exchange: String(data.exchange ?? ''),
    micCode: String(data.mic_code ?? micCode ?? ''),
    currency: String(data.currency ?? ''),
    close: Number(data.close),
  };
}
