/**
 * Weekly Pick dry run.
 *
 *   npm run test-weekly-pick                 # factor screen only: free, instant
 *   npm run test-weekly-pick -- --full       # whole pipeline, real Opus calls (~$1-3)
 *
 * Writes nothing to ai_stock_picks. `--full` does log its AI calls to ai_usage
 * like any other run, so the cost shows up in /admin/costs.
 *
 * There is deliberately no historical backtest here. The model has memorised
 * how stocks moved before its training cutoff, so replaying past weeks would
 * score its memory, not its judgement (see lib/ai/picks/system-prompt.ts). The
 * honest test is forward: every live pick stores its screened basket, so the
 * pick, the basket and SPY can be compared once the record is long enough.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { runFactorScreen, rankUniverse, pickShortlist, ratiosDisagree, describeScreen, MAX_PER_SECTOR, SCREEN_SIZE } from '../lib/picks/factor-screen';
import { runWeeklyPickPipeline, batchBySector, pickCostUsd } from '../lib/ai/picks/pipeline';
import { quarterOf, quarterRange, quarterLabel } from '../lib/picks/quarters';
import { extractJsonObject } from '../lib/ai/portfolio-builder/schema';
import { stripCitations } from '../lib/ai/picks/schema';

const full = process.argv.includes('--full');

function checkPureHelpers() {
  assert.equal(quarterOf('2026-09-28'), '2026-Q3');
  assert.equal(quarterOf('2026-10-05'), '2026-Q4');
  assert.deepEqual(quarterRange('2026-Q3'), { start: '2026-07-01', end: '2026-09-30' });
  assert.deepEqual(quarterRange('2024-Q1'), { start: '2024-01-01', end: '2024-03-31' });
  assert.equal(quarterLabel('2026-Q4'), 'Q4 2026');

  // Within one sector: the cheap, profitable, trending name must outrank the
  // expensive, unprofitable, falling one.
  const base = {
    name: null, market_cap: 5e9, ps_ratio: 2, ev_to_ebitda: 10, beta: 1, week52_high: 100,
    health_financial_strength: 15, updated_at: null, sector: 'Tech',
  };
  const ranked = rankUniverse([
    { ...base, ticker: 'GOOD', pe_ratio: 12, forward_pe: 10, profit_margin: 0.25, health_profitability: 28, day50_ma: 98, day200_ma: 85 },
    { ...base, ticker: 'MID', pe_ratio: 20, forward_pe: 18, profit_margin: 0.12, health_profitability: 18, day50_ma: 90, day200_ma: 88 },
    { ...base, ticker: 'BAD', pe_ratio: -5, forward_pe: null, profit_margin: -0.1, health_profitability: 4, day50_ma: 60, day200_ma: 80 },
  ]);
  assert.deepEqual(ranked.map((r) => r.ticker), ['GOOD', 'MID', 'BAD']);

  // The sector cap holds no matter how the ranking falls.
  const many = Array.from({ length: 10 }, (_, i) => ({
    ticker: `T${i}`, name: null, sector: i < 8 ? 'A' : 'B', marketCap: 1, composite: 100 - i,
    scores: { value: 1, quality: 1, momentum: 1, risk: 1 },
  }));
  const short = pickShortlist(many, 6, 4);
  assert.equal(short.filter((s) => s.sector === 'A').length, 4);
  assert.deepEqual(short.map((s) => s.ticker), ['T0', 'T1', 'T2', 'T3', 'T8', 'T9']);
  // Diligence batches never split a sector and stay roughly even.
  const items = [...'AAAABBBCCDDEFG'].map((sector) => ({ sector }));
  const batches = batchBySector(items, 2);
  assert.equal(batches.flat().length, items.length);
  for (const s of 'ABCDEFG') assert.equal(batches.filter((b) => b.some((x) => x.sector === s)).length, 1);
  assert.ok(Math.abs(batches[0].length - batches[1].length) <= 1);

  // JSON followed by more text still parses; citation markup is stripped.
  assert.equal(extractJsonObject('{"a":"}"} and then {"b":1}'), '{"a":"}"}');
  assert.equal(stripCitations('(cite index="123-5">Faces competition</cite> from free providers'), 'Faces competition from free providers');

  // Currency-mismatched rows are caught; consistent and loss-making ones pass.
  assert.equal(ratiosDisagree({ pe_ratio: 6.66, ps_ratio: 0.12, profit_margin: 0.296 }), true);  // HMY
  assert.equal(ratiosDisagree({ pe_ratio: 10.91, ps_ratio: 2.755, profit_margin: 0.257 }), false); // EOG
  assert.equal(ratiosDisagree({ pe_ratio: -5, ps_ratio: 0.2, profit_margin: -0.1 }), false);
  console.log('pure helpers: ok');
}

async function main() {
  checkPureHelpers();

  if (!full) {
    const a = await runFactorScreen({ exclude: new Set(), blockedSectors: new Set() });
    const b = await runFactorScreen({ exclude: new Set(), blockedSectors: new Set() });
    assert.deepEqual(a.shortlist.map((s) => s.ticker), b.shortlist.map((s) => s.ticker), 'screen is not deterministic');
    assert.equal(a.shortlist.length, SCREEN_SIZE);
    const perSector = new Map<string, number>();
    for (const s of a.shortlist) perSector.set(s.sector, (perSector.get(s.sector) ?? 0) + 1);
    assert.ok([...perSector.values()].every((n) => n <= MAX_PER_SECTOR), 'sector cap broken');

    const excludedTicker = a.shortlist[0].ticker;
    const c = await runFactorScreen({ exclude: new Set([excludedTicker]), blockedSectors: new Set() });
    assert.ok(!c.shortlist.some((s) => s.ticker === excludedTicker), 'exclusion broken');

    console.log(`\nuniverse ranked: ${a.universeSize}, excluded:`, a.excluded);
    console.log('sectors in shortlist:', Object.fromEntries(perSector));
    for (const s of a.shortlist) console.log(`  ${s.ticker.padEnd(6)} ${describeScreen(s)}`);
    console.log('\nscreen checks: ok. Pass --full to run the Opus stages.');
    return;
  }

  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  // Hard cap for dry runs (David, 2026-10-02: never above $3).
  const result = await runWeeklyPickPipeline({ todayET, maxUsd: 3 });
  const { trace } = result;

  console.log('\nscreen:', trace.screen?.shortlist.map((s) => `${s.ticker}(${s.sector})`).join(' '));
  console.log('grounding rejected:', trace.groundingRejected);
  console.log('\ndiligence:');
  for (const r of trace.diligence ?? []) {
    console.log(`  ${r.verdict === 'advance' ? '+' : '-'} ${r.symbol.padEnd(6)} [${r.theme}] ${r.redFlags.length ? `flags: ${r.redFlags.join('; ')}` : ''}`);
  }
  console.log('\nfinalists:', trace.finalists?.join(', '));
  console.log('votes:', trace.votes, trace.tiebreak ? `tie-break → ${trace.tiebreak.symbol}` : '');
  console.log('timings (ms from start):', trace.timingsMs);
  const t = trace.costTokens;
  const plainIn = t.input - t.cacheRead - t.cacheWrite;
  const cost = pickCostUsd(t);
  console.log(`tokens: ${plainIn} in + ${t.cacheWrite} cache write + ${t.cacheRead} cache read / ${t.output} out, ${t.webSearches} searches, ${cost.toFixed(2)} total`);

  if (!result.ok) {
    console.error(`\nFAILED at ${result.stage}: ${result.error}`);
    process.exit(1);
  }
  console.log('\nrow that would be inserted:\n', JSON.stringify({ ...result.row, metrics_snapshot: '(omitted)' }, null, 2));
  // Full row, including the audit trail, for `npm run check-weekly-pick -- --file=...`.
  writeFileSync('weekly-pick-dryrun.json', JSON.stringify({ ...result.row, generated_at: new Date().toISOString() }, null, 2));
  console.log('\nsaved weekly-pick-dryrun.json. Audit it with: npm run check-weekly-pick -- --file=weekly-pick-dryrun.json');
  console.log('\nvote:', JSON.stringify((result.row.metrics_snapshot as Record<string, unknown>).vote));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
