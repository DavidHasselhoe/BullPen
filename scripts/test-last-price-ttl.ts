/**
 * Asserts the session-aware cache lifetimes for quotes:
 *  - lastPriceTtlSeconds (lib/market-data/last-price-cache.ts): 3 min in the
 *    regular session, otherwise held to the next 9:30 ET open.
 *  - seedTtlSeconds (lib/market-data/seed-prices.ts): 15s regular, 60s
 *    pre/post, otherwise held to the next 04:00 ET pre-market.
 * Run: npx tsx scripts/test-last-price-ttl.ts
 */
import assert from 'node:assert/strict';
import { lastPriceTtlSeconds } from '@/lib/market-data/last-price-cache';
import { seedTtlSeconds } from '@/lib/market-data/seed-prices';

// October 2026 is EDT (UTC-4), late November EST (UTC-5).
const H = 3600;
const last = (iso: string) => lastPriceTtlSeconds(new Date(iso));
const seed = (iso: string) => seedTtlSeconds(new Date(iso));

assert.equal(last('2026-10-20T17:00:00Z'), 180, 'Tue 13:00 ET, regular session');
assert.equal(last('2026-10-20T20:05:00Z'), 180, 'Tue 16:05 ET, closing print settling');
assert.equal(last('2026-10-20T20:20:00Z'), 17 * H + 10 * 60, 'Tue 16:20 ET, held to Wed open');
assert.equal(last('2026-10-23T21:00:00Z'), 64.5 * H, 'Fri 17:00 ET, held over the weekend');
assert.equal(last('2026-10-30T21:00:00Z'), 65.5 * H, 'Fri 17:00 ET across the Nov 1 fall-back, one hour longer');
assert.equal(last('2026-10-20T12:00:00Z'), 1.5 * H, 'Tue 08:00 ET pre-market');
assert.equal(last('2026-11-25T22:00:00Z'), 40.5 * H, 'Wed 17:00 ET before Thanksgiving, held to Fri open');

assert.equal(seed('2026-10-20T17:00:00Z'), 15, 'Tue 13:00 ET, regular session');
assert.equal(seed('2026-10-20T12:00:00Z'), 60, 'Tue 08:00 ET, pre-market');
assert.equal(seed('2026-10-20T23:00:00Z'), 60, 'Tue 19:00 ET, post-market');
assert.equal(seed('2026-10-21T00:10:00Z'), 60, 'Tue 20:10 ET, late prints settling');
assert.equal(seed('2026-10-21T00:30:00Z'), 7.5 * H, 'Tue 20:30 ET, held to Wed 04:00');
assert.equal(seed('2026-10-24T16:00:00Z'), 40 * H, 'Sat 12:00 ET, held to Mon 04:00');

console.log('quote cache TTLs: all checks passed');
