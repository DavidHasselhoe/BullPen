/**
 * When a cached Why Today answer gets rewritten. No paid calls: the 8-K
 * section reads SEC EDGAR (free) and the shared Redis cache.
 *
 *   npm run test-why-today-staleness
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import assert from 'node:assert/strict';
import { isMaterial8K, isStale, needsRewrite, resolveWhyToday, whyTodayKey } from '../lib/ai/why-today';
import { rdel, rset } from '../lib/cache/redis-cache';

const at = (changePct: number) => ({ text: '', changePct, generatedAt: '' });

// A big day keeps its story: CEG explained at +6% still fits at +9%...
assert.equal(isStale(at(6), 9), false);
// ...but not once the move has more than grown by half.
assert.equal(isStale(at(6), 9.5), true);
assert.equal(isStale(at(12.25), 17), false);
assert.equal(isStale(at(12.25), 18.5), true);

// Small moves keep the 3-point floor.
assert.equal(isStale(at(2.5), 5.4), false);
assert.equal(isStale(at(2.5), 5.6), true);

// A reversal is always a new story, once it is big enough to explain at all.
assert.equal(isStale(at(7.7), -3.1), true);
assert.equal(isStale(at(2.5), -0.4), false);

// Only 8-Ks that can explain a move trigger a rewrite. Items as SEC lists them.
assert.equal(isMaterial8K('2.02,9.01'), true); // earnings
assert.equal(isMaterial8K('5.02'), true); // an executive leaving
assert.equal(isMaterial8K('1.01,2.03,7.01'), true);
assert.equal(isMaterial8K('5.07'), false); // shareholder vote results
assert.equal(isMaterial8K('9.01'), false); // exhibits only
assert.equal(isMaterial8K('5.03,9.01'), false); // bylaws
assert.equal(isMaterial8K(''), false);

async function filings() {
  const written = (iso: string) => ({ text: '', changePct: 6, generatedAt: iso });
  const hourAgo = new Date(Date.now() - 60 * 60_000).toISOString();

  // No SEC lookup at all: crypto, a listing-pinned holding, an answer under 20 minutes old.
  assert.equal(await needsRewrite('BTC/USD', written('2020-01-01T00:00:00Z'), 6), false);
  assert.equal(await needsRewrite('KOG', written('2020-01-01T00:00:00Z'), 6, 'XSTU'), false);
  assert.equal(await needsRewrite('NVDA', written(new Date().toISOString()), 6), false);

  // NVIDIA files 8-Ks every few weeks: an answer from 2020 predates the newest one...
  assert.equal(await needsRewrite('NVDA', written('2020-01-01T00:00:00Z'), 6), true);
  // ...and one written an hour ago does not, unless NVIDIA filed in the last hour.
  assert.equal(await needsRewrite('NVDA', written(hourAgo), 6), false);
}

// A throwaway ticker and dailyCap 0, so a regression here can never reach a paid generation.
async function atTheOpen() {
  const key = whyTodayKey('ZZTEST', 'en');
  const ask = (quote: { c: number; d: number; dp: number; priorSession?: boolean }) =>
    resolveWhyToday({ userId: 'staleness-test', ticker: 'ZZTEST', quote, language: 'en', mayGenerate: true, dailyCap: 0, source: 'inline' });
  await rset(key, { text: 'Pre-market answer.', changePct: 6, generatedAt: new Date().toISOString() }, 60);
  try {
    // Yesterday's -15% still on the quote: the morning's answer stands.
    assert.equal((await ask({ c: 10, d: -2, dp: -15, priorSession: true })).status, 'ready');
    // A real reversal it can't rewrite: nothing, not "shares rose" beside a stock down 15%.
    assert.equal((await ask({ c: 10, d: -2, dp: -15 })).status, 'skipped');
  } finally {
    await rdel(key);
  }
  // Nothing cached and no trade yet: no generation from yesterday's numbers.
  assert.equal((await ask({ c: 10, d: -2, dp: -15, priorSession: true })).status, 'skipped');
}

filings().then(atTheOpen).then(() => console.log('why today staleness: ok'));
