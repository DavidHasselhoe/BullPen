/**
 * Asserts lastPriceTtlSeconds (lib/market-data/last-price-cache.ts): short
 * during the regular session, held until an hour before the next 9:30 ET open
 * otherwise. Run: npx tsx scripts/test-last-price-ttl.ts
 */
import assert from 'node:assert/strict';
import { lastPriceTtlSeconds } from '@/lib/market-data/last-price-cache';

// October 2026 is EDT (UTC-4).
const at = (iso: string) => lastPriceTtlSeconds(new Date(iso));
const H = 3600;

assert.equal(at('2026-10-20T17:00:00Z'), 180, 'Tue 13:00 ET, regular session');
assert.equal(at('2026-10-20T20:05:00Z'), 180, 'Tue 16:05 ET, closing print settling');
assert.equal(at('2026-10-20T20:20:00Z'), 17 * H + 10 * 60 - H, 'Tue 16:20 ET, held to Wed open');
assert.equal(at('2026-10-23T21:00:00Z'), 64.5 * H - H, 'Fri 17:00 ET, held over the weekend');
assert.equal(at('2026-10-20T12:00:00Z'), 1.5 * H - H, 'Tue 08:00 ET pre-market');
assert.equal(at('2026-10-20T13:00:00Z'), 180, 'Tue 09:00 ET, inside the hour-early margin');

console.log('last-price TTL: all checks passed');
