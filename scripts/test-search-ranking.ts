/**
 * Ranking checks for local symbol search (`npx tsx scripts/test-search-ranking.ts`).
 *
 * The fixture cases are the ones that were actually wrong before ranks existed:
 * "micro" returned MicroAlgo ahead of Microsoft, "tesl" returned a leveraged
 * Tesla ETF ahead of TSLA, "coca" buried Coca-Cola under Coca-Cola Consolidated.
 *
 * Pass --live to also benchmark against the real catalogue from a running dev
 * server, which is how the per-keystroke timing claim gets checked.
 */

import assert from 'node:assert';
import { parseSearchIndex, searchSymbols } from '../lib/search/local-index';

const FIXTURE = [
  'MSFT\tMicrosoft Corporation\ts\t67',
  'MU\tMicron Technology, Inc.\ts\t62',
  'MLGO\tMicroAlgo Inc.\ts\t0',
  'MVIS\tMicroVision, Inc.\ts\t8',
  'TSLA\tTesla, Inc.\ts\t66',
  'TESL\tSimplify Volt TSLA Revolution ETF\te\t5',
  'TSLL\tDirexion Daily TSLA Bull 2X Shares\te\t5',
  'KO\tThe Coca-Cola Company\ts\t61',
  'COKE\tCoca-Cola Consolidated Inc.\ts\t50',
  'SPY\tState Street SPDR S&P 500 ETF Trust\te\t45',
  'SPYD\tSPDR Portfolio S&P 500 High Dividend ETF\te\t30',
  'VOO\tVanguard S&P 500 ETF\te\t45',
  'NVDA\tNVIDIA Corporation\ts\t67',
  'NVDX\tT-Rex 2X Long NVIDIA Daily Target ETF\te\t5',
].join('\n');

const index = parseSearchIndex(FIXTURE);
assert.equal(index.length, 14, 'every fixture row parses');

const top = (q: string) => searchSymbols(index, q, 5).map((r) => r.ticker);

// An exact ticker always wins, even against a much more popular prefix match.
assert.equal(top('tesl')[0], 'TESL', 'exact ticker beats everything');
assert.equal(top('ko')[0], 'KO');

// Within a tier, rank decides — this is the whole reason ranks are precomputed.
assert.equal(top('micro')[0], 'MSFT', 'Microsoft leads "micro", not MicroAlgo');
assert.ok(top('micro').indexOf('MU') < top('micro').indexOf('MLGO'), 'Micron beats MicroAlgo');
assert.equal(top('coca')[0], 'KO', 'The Coca-Cola Company leads "coca"');

// Ticker prefix outranks a name match, shortest ticker first.
assert.equal(top('nvd')[0], 'NVDA', 'NVDA before NVDX on a ticker prefix');
assert.equal(top('spy')[0], 'SPY');

// Stocks edge out funds at equal match strength.
assert.equal(top('tesla')[0], 'TSLA', 'TSLA leads a name search over Tesla-derivative funds');

// A query matching nothing returns nothing rather than filler.
assert.deepEqual(top('zzzzz'), []);
assert.deepEqual(top('   '), []);

console.log('✓ ranking rules hold');

async function live() {
  const url = process.env.APP_URL ?? 'http://localhost:3000';
  const res = await fetch(`${url}/api/search/index`);
  const payload = await res.text();

  const t0 = process.hrtime.bigint();
  const live = parseSearchIndex(payload);
  const parseMs = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`\nlive catalogue: ${live.length} rows, parsed in ${parseMs.toFixed(0)}ms, ${(payload.length / 1024).toFixed(0)}KB raw`);

  for (const q of ['n', 'nv', 'nvid', 'appl', 'tesl', 'micro', 'bank of am', 'spy', 's&p 500', 'coca', 'brk', 'vang', 'amaz']) {
    const s = process.hrtime.bigint();
    const hits = searchSymbols(live, q, 5);
    const ms = Number(process.hrtime.bigint() - s) / 1e6;
    console.log(`  ${q.padEnd(11)} ${ms.toFixed(2).padStart(5)}ms  ${hits.map((h) => h.ticker).join(', ')}`);
  }

  const s = process.hrtime.bigint();
  for (let i = 0; i < 300; i++) searchSymbols(live, 'micro', 8);
  console.log(`\n  median per keystroke: ${(Number(process.hrtime.bigint() - s) / 1e6 / 300).toFixed(2)}ms`);
}

if (process.argv.includes('--live')) void live();
