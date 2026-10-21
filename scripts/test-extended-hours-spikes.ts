// npm run test-extended-hours-spikes: the stray-print filter against JPM's real bars.
import assert from 'node:assert/strict';
import { strayExtendedPrints } from '../lib/market-data/extended-hours-spikes';

const NY = 'America/New_York';
const day = (bars: [string, number][]) => ({ t: bars.map(([hm]) => `2026-10-01 ${hm}:00`), c: bars.map(([, c]) => c) });

// 2026-10-01 after hours: two bad prints in a row (316, 315) between 333s.
const twoBad = day([['15:40', 333.1], ['15:45', 333.2], ['15:50', 333.2], ['15:55', 333.3], ['16:00', 333.0], ['16:05', 333.2],
  ['16:35', 333.2], ['16:55', 330.5], ['17:00', 316.3], ['17:05', 315.3], ['17:10', 333.3], ['17:25', 333.3], ['17:30', 333.2], ['17:40', 333.1]]);
assert.deepEqual([...strayExtendedPrints(twoBad.t, twoBad.c, NY)].map((i) => twoBad.t[i].slice(11, 16)), ['17:00', '17:05']);

// A real after-hours move (earnings, +6%) that holds is kept.
const realMove = day([['16:00', 100], ['16:05', 100], ['16:10', 100], ['16:15', 100], ['16:20', 100], ['16:25', 100],
  ['16:30', 106], ['16:35', 106.2], ['16:40', 106.1], ['16:45', 106.3], ['16:50', 106.2], ['16:55', 106.4], ['17:00', 106.3], ['17:05', 106.5]]);
assert.equal(strayExtendedPrints(realMove.t, realMove.c, NY).size, 0);

// A non-US listing is left alone: its session is not New York's.
assert.equal(strayExtendedPrints(twoBad.t, twoBad.c, 'Europe/Oslo').size, 0);

// A regular-session crash is never filtered.
const crash = day([['10:00', 100], ['10:05', 100], ['10:10', 100], ['10:15', 90], ['10:20', 100], ['10:25', 100], ['10:30', 100]]);
assert.equal(strayExtendedPrints(crash.t, crash.c, NY).size, 0);

console.log('ok - extended-hours stray prints');
