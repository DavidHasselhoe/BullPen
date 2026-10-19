/**
 * When a cached Why Today answer gets rewritten. No paid calls: the 8-K
 * section reads SEC EDGAR (free) and the shared Redis cache.
 *
 *   npm run test-why-today-staleness
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import assert from 'node:assert/strict';
import { isStale, needsRewrite } from '../lib/ai/why-today';

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

filings().then(() => console.log('why today staleness: ok'));
