/**
 * Groups the overlap panel's trades (newest first) into one entry per stock,
 * one person per politician inside it. Pure, so the self-check can pin it:
 * the first version kept each person's OLDEST trade (a Map overwrites with the
 * last value, and the rows arrive newest first), so a member who bought and
 * then sold still read "bought".
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
}

export function groupOverlap(trades: ActivityTrade[], held: Set<string>): OverlapStock[] {
  // Sort here rather than trust the caller: the newest-first order is what
  // makes "latest" mean latest.
  const sorted = [...trades].sort((a, b) => (a.transactionDate < b.transactionDate ? 1 : a.transactionDate > b.transactionDate ? -1 : 0));
  const stocks = new Map<string, Map<string, OverlapPerson>>();
  for (const t of sorted) {
    let people = stocks.get(t.symbol);
    if (!people) stocks.set(t.symbol, (people = new Map()));
    const p = people.get(t.slug);
    if (p) p.count += 1;
    else people.set(t.slug, { slug: t.slug, displayName: t.displayName, latest: t, count: 1 });
  }
  return [...stocks].map(([symbol, people]) => {
    const list = [...people.values()];
    return {
      symbol,
      held: held.has(symbol),
      latestDate: list[0].latest.transactionDate,
      people: list,
      buyers: list.filter((p) => tradeDirection(p.latest.tradeType) === 'buy').length,
      sellers: list.filter((p) => tradeDirection(p.latest.tradeType) === 'sell').length,
    };
  });
  // Map insertion order already follows the newest trade per stock.
}
