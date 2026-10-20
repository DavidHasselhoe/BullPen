import { SP500_TICKERS } from './sp500';
import { NASDAQ100_TICKERS } from './nasdaq100';
import { DOW30_TICKERS } from './dow30';

/** The indexes a stock page badges, biggest first. Lists are synced weekly (scripts/sync-index-constituents.ts). */
export type IndexId = 'sp500' | 'nasdaq100' | 'dow30';

const MEMBERS: [IndexId, Set<string>][] = [
  ['sp500', new Set(SP500_TICKERS)],
  ['nasdaq100', new Set(NASDAQ100_TICKERS)],
  ['dow30', new Set(DOW30_TICKERS)],
];

export function indexMemberships(ticker: string): IndexId[] {
  const t = ticker.toUpperCase();
  return MEMBERS.filter(([, set]) => set.has(t)).map(([id]) => id);
}
