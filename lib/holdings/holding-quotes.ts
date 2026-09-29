import type { BatchQuote } from '@/lib/market-data/quote-batcher';
import type { UserHolding } from '@/lib/types/database';

/**
 * The quote request behind every "what is my portfolio worth" number: My
 * Holdings and Home both go through here, so the two can never show different
 * totals or day changes for the same account.
 *
 * - `prepost` outside the regular session: TwelveData only returns the
 *   extended-hours print when asked, otherwise the regular close stands in for
 *   the real last trade and after-hours moves go missing.
 * - Holdings pinned to a listing (mic_code) send it, so a quote isn't re-guessed
 *   from the bare symbol (Kongsberg Gruppen on XSTU, not some other KOG).
 */
export async function fetchHoldingQuotes(
  symbols: string[],
  holdings: Pick<UserHolding, 'symbol' | 'mic_code'>[],
  prepost: boolean,
): Promise<Record<string, BatchQuote>> {
  if (symbols.length === 0) return {};

  const micCodes: Record<string, string> = {};
  for (const h of holdings) if (h.mic_code) micCodes[h.symbol] = h.mic_code;

  const res = await fetch('/api/quotes/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      symbols,
      prepost,
      ...(Object.keys(micCodes).length > 0 ? { micCodes } : {}),
    }),
  });
  const json = await res.json();
  if (res.status === 429) {
    throw new Error(json.error || 'Market data rate limit exceeded. Please try again in a minute.');
  }
  return json.success && json.quotes ? json.quotes : {};
}
