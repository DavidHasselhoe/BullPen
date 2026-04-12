'use client';

/**
 * Deduplicate concurrent POST /visit for the same ticker (React Strict Mode runs
 * effects twice on mount in dev, which would otherwise double-count visits).
 */
const inflight = new Map<string, Promise<Response>>();

export function postStockVisit(ticker: string): Promise<Response> {
  const key = ticker.toUpperCase();
  const existing = inflight.get(key);
  if (existing) return existing;

  const p = fetch(`/api/stock/${encodeURIComponent(key)}/visit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  }).finally(() => {
    // Defer clearing so a remounted effect in the same Strict Mode pass still reuses this promise.
    setTimeout(() => inflight.delete(key), 100);
  });

  inflight.set(key, p);
  return p;
}
