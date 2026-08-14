/**
 * In-memory promise cache that prevents duplicate concurrent fetches of the
 * same key within a single warm serverless instance. Vercel's Fluid Compute
 * reuses instances across concurrent requests, so two components hitting
 * different API routes for the same underlying TwelveData data (e.g.
 * HealthScoreCard and FinancialsSection both wanting the income statement on
 * a cold stock page) share one in-flight fetch instead of both missing the
 * Supabase cache and firing their own — the callers already agree on the
 * cache key, this just closes the race between "check cache" and "write
 * cache" for whoever gets there first.
 */
const inFlight = new Map<string, Promise<unknown>>();

export function coalesce<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fetcher().finally(() => {
    inFlight.delete(key);
  });
  inFlight.set(key, promise);
  return promise;
}
