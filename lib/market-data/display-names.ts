/**
 * Short, human company names for compact lists ("Eli Lilly", not
 * "ELI LILLY & Co" or "Eli Lilly and Company"). Beginners know companies by
 * name, not ticker, so lists lead with this and show the ticker beside it.
 *
 * Source order: search_index (market-data reference names, properly cased,
 * covers every US listing) → companies (SEC-style names, often ALL CAPS,
 * and missing many large caps entirely).
 */

import { createServerClient } from '@/lib/supabase/client';
import { displayCompanyName } from './company-name';

// The name rule itself lives in company-name.ts so client components can use it.
export { displayCompanyName };

// Companies the public knows by their acronym, not their legal name.
const KNOWN_AS: Record<string, string> = { IBM: 'IBM', AMD: 'AMD' };

// Per-instance memo. Company names effectively never change, and the movers
// REST route and SSE stream ask for the same ~50 tickers on every request.
// A miss is remembered too (as ''), so an unnamed ticker is not re-queried.
const memo = new Map<string, string>();

/** Ticker → short display name. Tickers with no real name are left out. */
export async function getDisplayNames(tickers: string[]): Promise<Map<string, string>> {
  const upper = [...new Set(tickers.map((t) => t.toUpperCase()))];
  const missing = upper.filter((t) => !memo.has(t));
  if (missing.length > 0) {
    const fetched = await fetchDisplayNames(missing);
    // A failed lookup must not be memoised as "has no name" for the life of the instance.
    if (fetched) for (const t of missing) memo.set(t, fetched.get(t) ?? '');
  }
  const out = new Map<string, string>();
  for (const t of upper) {
    const name = memo.get(t);
    if (name) out.set(t, name);
  }
  return out;
}

async function fetchDisplayNames(upper: string[]): Promise<Map<string, string> | null> {
  const out = new Map<string, string>();
  const db = createServerClient();
  // .in() over at most a few hundred tickers stays under PostgREST's 1000-row cap.
  const [search, companies] = await Promise.all([
    db.from('search_index').select('ticker, name').in('ticker', upper),
    db.from('companies').select('ticker, name').in('ticker', upper),
  ]);
  if (search.error || companies.error) return null;
  for (const rows of [companies.data, search.data]) {
    for (const r of (rows ?? []) as Array<{ ticker: string; name: string | null }>) {
      if (r.name && r.name.toUpperCase() !== r.ticker.toUpperCase()) {
        out.set(r.ticker.toUpperCase(), displayCompanyName(r.name)); // search_index written last, wins
      }
    }
  }
  for (const t of upper) if (KNOWN_AS[t]) out.set(t, KNOWN_AS[t]);
  return out;
}
