/**
 * Client-side request coalescing for /api/quotes/batch.
 *
 * A dashboard load used to produce four separate POSTs to this endpoint —
 * crypto card, portfolio summary, why-today, recently-viewed — each with its own
 * handful of symbols, each its own serverless invocation, each averaging 1167ms
 * in production. They are all asking the same route the same question at the
 * same moment.
 *
 * Callers that arrive within one tick are merged into a single request for the
 * union of their symbols, and each caller gets back only what it asked for. The
 * endpoint costs one credit per symbol either way, so this is strictly fewer
 * round trips for the same credits.
 *
 * Deliberately not a cache: TanStack Query already handles reuse over time. This
 * only merges requests that are in flight together, which is the case caching
 * cannot help with.
 */

export interface BatchQuote {
  price: number;
  change: number;
  changePercent: number;
  stale?: boolean;
}

/** Symbols whose exchange matters for disambiguation (see app/holdings). */
type MicCodes = Record<string, string>;

interface Waiter {
  symbols: string[];
  resolve: (quotes: Record<string, BatchQuote>) => void;
  reject: (err: unknown) => void;
}

const waiting: Waiter[] = [];
let pendingMics: MicCodes = {};
let scheduled = false;

async function flush() {
  const batch = waiting.splice(0, waiting.length);
  const mics = pendingMics;
  pendingMics = {};
  scheduled = false;
  if (batch.length === 0) return;

  const symbols = [...new Set(batch.flatMap((w) => w.symbols))];

  try {
    const res = await fetch('/api/quotes/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols,
        ...(Object.keys(mics).length > 0 ? { micCodes: mics } : {}),
      }),
    });
    const json = (await res.json()) as { quotes?: Record<string, BatchQuote> };
    const quotes = json.quotes ?? {};
    for (const w of batch) {
      // Hand each caller its own slice, so nobody has to know it shared a request.
      const own: Record<string, BatchQuote> = {};
      for (const s of w.symbols) if (quotes[s]) own[s] = quotes[s];
      w.resolve(own);
    }
  } catch (err) {
    for (const w of batch) w.reject(err);
  }
}

/**
 * Quotes for these symbols, merged with any other request made in the same tick.
 */
export function fetchQuotesBatched(
  symbols: string[],
  micCodes?: MicCodes
): Promise<Record<string, BatchQuote>> {
  if (symbols.length === 0) return Promise.resolve({});

  return new Promise((resolve, reject) => {
    waiting.push({ symbols, resolve, reject });
    if (micCodes) pendingMics = { ...pendingMics, ...micCodes };
    if (!scheduled) {
      scheduled = true;
      // A microtask is too tight — widgets mount across a few renders, not one.
      // A frame is long enough to catch them and short enough to be invisible.
      setTimeout(flush, 16);
    }
  });
}
