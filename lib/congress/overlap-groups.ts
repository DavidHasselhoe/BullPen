/**
 * Groups the overlap panel's trades into one entry per stock, one person per
 * politician inside it. Pure, so the self-check can pin it: the first version
 * kept each person's OLDEST trade (a Map overwrites with the last value, and
 * the rows arrive newest first), so a member who bought and then sold still
 * read "bought".
 */

import { tradeDirection } from './types';
import type { ActivityTrade } from './insights';

export interface OverlapPerson {
  slug: string;
  displayName: string;
  /** Their most recent trade in this stock; its direction is the one shown. */
  latest: ActivityTrade;
  /** How many trades they filed in this stock in the window. */
  count: number;
  /** Of those, how many arrived since the user's last visit. */
  newCount: number;
}

export interface OverlapStock {
  symbol: string;
  held: boolean;
  /** Newest trade date across everyone (YYYY-MM-DD). */
  latestDate: string;
  /** Newest first. */
  people: OverlapPerson[];
  /** People whose latest trade was a buy / a sell. Anything else counts in neither. */
  buyers: number;
  sellers: number;
  /** Trades that arrived since the user's last visit. */
  newCount: number;
}

/**
 * True when we ingested the trade after `since`. Parsed, not string-compared:
 * Postgres writes '2026-10-13 14:00:12.123456+00' style offsets and the route
 * writes JS ISO strings.
 */
export function isNewTrade(t: Pick<ActivityTrade, 'addedAt'>, since: string | null | undefined): boolean {
  if (!since || !t.addedAt) return false;
  const added = Date.parse(t.addedAt);
  const line = Date.parse(since);
  return Number.isFinite(added) && Number.isFinite(line) && added > line;
}

/** A gap this long between panel loads starts a new visit. */
export const VISIT_GAP_MS = 2 * 60 * 60 * 1000;

/**
 * The "new since" line for this load, and what to store (migration 170).
 * A first-ever load marks nothing new rather than calling all 90 days new.
 * Within a visit the line holds still, so a reload keeps the markers; after a
 * gap the previous visit's last load becomes the line.
 */
export function overlapVisit(
  seenAt: string | null,
  since: string | null,
  now: Date,
): { newSince: string | null; store: { congress_overlap_seen_at: string; congress_overlap_since: string } } {
  const nowIso = now.toISOString();
  const seen = seenAt ? Date.parse(seenAt) : NaN;
  if (!Number.isFinite(seen)) return { newSince: null, store: { congress_overlap_seen_at: nowIso, congress_overlap_since: nowIso } };
  if (now.getTime() - seen > VISIT_GAP_MS) return { newSince: seenAt, store: { congress_overlap_seen_at: nowIso, congress_overlap_since: seenAt! } };
  const line = since ?? seenAt;
  return { newSince: line, store: { congress_overlap_seen_at: nowIso, congress_overlap_since: line! } };
}

/**
 * Stocks with something new lead (that is what someone catching up came for),
 * then the rest by their newest trade.
 */
export function groupOverlap(trades: ActivityTrade[], held: Set<string>, newSince?: string | null): OverlapStock[] {
  // Sort here rather than trust the caller: newest first is what makes "latest" mean latest.
  const sorted = [...trades].sort((a, b) => (a.transactionDate < b.transactionDate ? 1 : a.transactionDate > b.transactionDate ? -1 : 0));
  const stocks = new Map<string, Map<string, OverlapPerson>>();
  for (const t of sorted) {
    let people = stocks.get(t.symbol);
    if (!people) stocks.set(t.symbol, (people = new Map()));
    const isNew = isNewTrade(t, newSince) ? 1 : 0;
    const p = people.get(t.slug);
    if (p) {
      p.count += 1;
      p.newCount += isNew;
    } else people.set(t.slug, { slug: t.slug, displayName: t.displayName, latest: t, count: 1, newCount: isNew });
  }
  const groups = [...stocks].map(([symbol, people]) => {
    const all = [...people.values()];
    // Within a stock too, whoever brought news leads; a late filing of an old
    // trade would otherwise sit mid-list under its trade date.
    const list = [...all.filter((p) => p.newCount > 0), ...all.filter((p) => p.newCount === 0)];
    return {
      symbol,
      held: held.has(symbol),
      latestDate: all[0].latest.transactionDate,
      people: list,
      buyers: list.filter((p) => tradeDirection(p.latest.tradeType) === 'buy').length,
      sellers: list.filter((p) => tradeDirection(p.latest.tradeType) === 'sell').length,
      newCount: list.reduce((n, p) => n + p.newCount, 0),
    };
  });
  // Stable: within each half, Map insertion order already follows the newest trade per stock.
  return [...groups.filter((g) => g.newCount > 0), ...groups.filter((g) => g.newCount === 0)];
}
