// Verifies attachMarketCap: known S&P 500 tickers get a real market_cap,
// an unknown ticker gets null, and an empty input short-circuits to [].
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { attachMarketCap } from '../lib/market-data/calendar-market-cap';

async function main() {
  const empty = await attachMarketCap([]);
  if (empty.length !== 0) throw new Error(`Expected [] for empty input, got ${JSON.stringify(empty)}`);

  const input = [
    { symbol: 'AAPL' },
    { symbol: 'MSFT' },
    { symbol: 'ZZZNOTREAL' },
  ];
  const result = await attachMarketCap(input);
  console.log(result);

  const aapl = result.find((r) => r.symbol === 'AAPL');
  const msft = result.find((r) => r.symbol === 'MSFT');
  const unknown = result.find((r) => r.symbol === 'ZZZNOTREAL');

  if (!aapl || typeof aapl.market_cap !== 'number' || aapl.market_cap <= 0) {
    throw new Error(`Expected AAPL to have a positive market_cap, got ${aapl?.market_cap}`);
  }
  if (!msft || typeof msft.market_cap !== 'number' || msft.market_cap <= 0) {
    throw new Error(`Expected MSFT to have a positive market_cap, got ${msft?.market_cap}`);
  }
  if (!unknown || unknown.market_cap !== null) {
    throw new Error(`Expected unknown ticker to resolve to market_cap null, got ${unknown?.market_cap}`);
  }

  console.log('PASS: attachMarketCap resolves known tickers and nulls out unknown/empty input');
}

main().catch((err) => {
  console.error('FAIL:', err);
  process.exit(1);
});
