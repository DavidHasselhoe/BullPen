/**
 * Self-check for the weekly "What's new" digest (lib/notifications/release-notes.ts).
 * Pure: no database, no network. Run: npm run test-release-notes
 */

import assert from 'node:assert/strict';
import { weeklyHighlights, type ChangelogDay } from '../lib/notifications/release-notes';

const days: ChangelogDay[] = [
  { date: '2026-11-02', entries: [{ type: 'new', text: 'run day, too new', highlight: true }] },
  { date: '2026-11-01', entries: [{ type: 'fixed', text: 'fix', highlight: true }, { type: 'new', text: 'not highlighted' }] },
  { date: '2026-10-29', entries: [{ type: 'improved', text: 'better', highlight: true }, { type: 'new', text: 'shiny', highlight: true }] },
  { date: '2026-10-26', entries: [{ type: 'new', text: 'first day of the window', highlight: true }] },
  { date: '2026-10-25', entries: [{ type: 'new', text: 'too old', highlight: true }] },
];

const week = weeklyHighlights(days, '2026-11-02');
assert.ok(week);
assert.equal(week.from, '2026-10-26');
assert.equal(week.to, '2026-11-01');
// Highlights only, inside the seven days before the run, New then Improved then Fixed.
assert.deepEqual(week.items.map((i) => i.text), ['shiny', 'first day of the window', 'better', 'fix']);

// A week without highlights sends nothing.
assert.equal(weeklyHighlights([{ date: '2026-10-29', entries: [{ type: 'new', text: 'quiet' }] }], '2026-11-02'), null);

console.log('ok - release notes digest');
