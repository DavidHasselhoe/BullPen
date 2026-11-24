/**
 * Self-check for lib/instagram/weekly-insights.ts (no network).
 * npm run test-instagram-weekly-insights
 */
import assert from 'node:assert/strict';
import { buildWeeklySummary, completedWeek, fmtChange, type AccountTotals } from '@/lib/instagram/weekly-insights';

// Run on Monday 2026-11-30 07:00 UTC: reports Mon 11-23 to Sun 11-29.
const monday = new Date('2026-11-30T07:00:00Z');
const week = completedWeek(monday);
assert.equal(week.start.toISOString(), '2026-11-23T00:00:00.000Z');
assert.equal(week.end.toISOString(), '2026-11-30T00:00:00.000Z');
assert.equal(week.key, '2026-W48');
assert.equal(completedWeek(monday, 1).key, '2026-W47');
// Any other weekday of the same week reports the same completed week.
assert.equal(completedWeek(new Date('2026-12-06T23:59:00Z')).key, '2026-W48');

assert.equal(fmtChange(null, 9), '9');
assert.equal(fmtChange(2, 8), '2 → 8'); // no "+300%" off a tiny base
assert.equal(fmtChange(200, 150), '200 → 150 (-25%)');
assert.equal(fmtChange(1000, 1500), '1,000 → 1,500 (+50%)');

const zero: AccountTotals = { views: 0, reach: 0, profile_views: 0, website_clicks: 0 };
const embed = buildWeeklySummary({
  week,
  account: { ...zero, views: 41 },
  prevAccount: { ...zero, views: 14 },
  followers: 10,
  prevFollowers: null,
  posts: [
    { id: 'hand', permalink: 'https://i/r1', postedAt: Date.parse('2026-11-24T12:45:00Z'), isReel: true, stats: { views: 6, ig_reels_avg_watch_time: 22843 } },
    { id: 'auto', permalink: 'https://i/p1', postedAt: Date.parse('2026-11-29T12:00:00Z'), isReel: false, stats: null },
  ],
  pipeline: new Map([['auto', 'earnings_calendar']]),
});
const d = embed.description!;
assert.match(d, /Views: 14 → 41/);
assert.match(d, /Followers: 10 \(first week tracked\)/);
assert.ok(d.includes('**Posted by hand (1)**\n[Reel, Tue Nov 24](https://i/r1): 6 views'));
assert.ok(d.includes('**Automatic posts (1)**\n[Earnings calendar, Sun Nov 29](https://i/p1): stats unavailable'));
assert.match(d, /22\.8 s on average/);
assert.match(embed.title!, /^Instagram week 48: Nov 23-29, 2026$/);

console.log('instagram weekly insights: all checks passed');
