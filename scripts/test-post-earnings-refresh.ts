/**
 * Assert-based check for reportersBehind. No framework.
 *   npx tsx scripts/test-post-earnings-refresh.ts
 *
 * Pinned against 2026-10-30: GOOGL reported Oct 28 and AMZN Oct 29, both with
 * cached statements ending Jun 30. AAPL is the slow-reporter edge, where a
 * statement that already holds the reported quarter must not count as behind.
 */

import assert from 'node:assert/strict';
import { reportersBehind } from '../lib/cache/fundamentals-freshness';

const newest = new Map([
  ['GOOGL', '2026-06-30'],
  ['AMZN', '2026-06-30'],
  ['MSFT', '2026-09-30'],
  ['AAPL', '2026-06-27'],
]);

assert.deepEqual(
  reportersBehind(
    [
      { symbol: 'GOOGL', date: '2026-10-28' },
      { symbol: 'AMZN', date: '2026-10-29' },
      // Statements already include the quarter it reported.
      { symbol: 'MSFT', date: '2026-10-28' },
      // 64 days after the period end: the June quarter, already stored.
      { symbol: 'AAPL', date: '2026-08-30' },
      // Never cached: the financials prefetch fetches it, nothing to re-check.
      { symbol: 'META', date: '2026-10-29' },
      // Listed twice (TD and Nasdaq days), checked once.
      { symbol: 'GOOGL', date: '2026-10-27' },
    ],
    newest,
  ).sort(),
  ['AMZN', 'GOOGL'],
);

console.log('post-earnings refresh checks passed');
