/**
 * Re-captures the fixtures that scripts/test-segment-selection.ts asserts on.
 *
 * Needed when a company files a new 10-K: the test pins exact figures (Apple's
 * FY2025 iPhone at $209.586B), so a new filing makes them stale by design
 * rather than by accident. Re-run this, then update the expected numbers in
 * the test from the printed output.
 *
 * Run: npm run capture-segment-fixtures
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { writeFileSync, mkdirSync } from 'fs';
import { fetchRevenueFacts } from '../lib/segments/edgar-facts';

const TICKERS = ['GOOGL', 'AAPL', 'MU', 'NVDA', 'WMT'];

(async () => {
  mkdirSync('scripts/segment-fixtures', { recursive: true });
  for (const ticker of TICKERS) {
    const filing = await fetchRevenueFacts(ticker, '10-K');
    if (!filing) {
      console.log(`${ticker}: no filing found`);
      continue;
    }
    writeFileSync(`scripts/segment-fixtures/${ticker}.json`, JSON.stringify(filing, null, 2));
    console.log(`${ticker} ${filing.periodEnd} ${filing.facts.length} facts (${filing.accession})`);
    // SEC fair access: space the requests out.
    await new Promise((r) => setTimeout(r, 200));
  }
})();
