// One-off: compute+sync health score categories for specific tickers whose
// screener_stats row predates migration 122 (has an aggregate health_score
// but NULL category columns). screener_stats is ticker-keyed, not per-user,
// so this fixes it for every user holding these tickers.
import { config } from 'dotenv';
import { resolve } from 'path';
config({ path: resolve(process.cwd(), '.env.local') });

import { getHealthScoreForSymbol } from '../lib/finance/get-health-score';

const TICKERS = process.argv.slice(2);

async function main() {
  if (TICKERS.length === 0) {
    console.error('Usage: tsx scripts/backfill-health-categories.ts TICKER1 TICKER2 ...');
    process.exit(1);
  }
  for (const ticker of TICKERS) {
    try {
      const { healthScore, degraded } = await getHealthScoreForSymbol(ticker);
      console.log(`${degraded ? '⚠️' : '✅'} ${ticker}: score=${healthScore.score} grade=${healthScore.grade} degraded=${degraded}`);
    } catch (err) {
      console.error(`❌ ${ticker}:`, err instanceof Error ? err.message : err);
    }
  }
}

main();
