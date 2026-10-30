/**
 * Assert-based check for the economic result notification wording. No framework.
 *   npx tsx scripts/test-economic-verdicts.ts
 *
 * The wording is the feature: a raise must not read as a cut, "up from" must
 * follow the numbers, and a lost-jobs month must not say "added -20,000".
 * Rendered through en/navigation.json, the same keys the panel translates.
 */

import assert from 'node:assert/strict';
import { enText } from '../lib/notifications/notification-creators';
import { economicResultText, type EconomicResultEvent } from '../lib/market-data/economic-verdict';
import { economyLinkForLesson } from '../lib/market-data/economic-kinds';

function english(e: Omit<EconomicResultEvent, 'id'>) {
  const text = economicResultText({ id: 'x', ...e });
  assert.ok(text, `${e.kind}: no text`);
  return { title: enText(text.title), message: text.message ? enText(text.message) : '' };
}

const fed = (actual: [number, number], previous: [number, number] | null, verdict: EconomicResultEvent['verdict']) =>
  english({
    kind: 'fomc',
    verdict,
    results: [
      { key: 'rate_upper', actual: actual[1], previous: previous?.[1] ?? null },
      { key: 'rate_lower', actual: actual[0], previous: previous?.[0] ?? null },
    ],
  });

assert.deepEqual(fed([3.75, 4], [3.75, 4], 'hold'), {
  title: 'The Fed held rates at 3.75% to 4.00%',
  message: 'Rates on loans and savings accounts should stay about where they are.',
});
assert.equal(fed([3.5, 3.75], [3.75, 4], 'lower').title, 'The Fed lowered rates by 0.25 percentage points to 3.50% to 3.75%');
assert.equal(fed([4, 4.5], [3.75, 4], 'raise').title, 'The Fed raised rates by 0.5 percentage points to 4.00% to 4.50%');
assert.deepEqual(fed([3.75, 4], null, null), { title: 'The Fed set rates at 3.75% to 4.00%', message: '' });

assert.deepEqual(
  english({
    kind: 'cpi',
    verdict: null,
    results: [
      { key: 'cpi_yoy', actual: 2.9, previous: 2.7 },
      { key: 'cpi_mom', actual: 0.3, previous: 0.2 },
      { key: 'core_cpi_yoy', actual: 3, previous: 3.1 },
    ],
  }),
  {
    title: 'CPI inflation was 2.9% over the past year',
    message: 'Up from 2.7% the month before. Core inflation, which leaves out food and energy, was 3.0%. The Fed aims for 2%.',
  },
);
assert.equal(
  english({ kind: 'pce', verdict: null, results: [{ key: 'pce_yoy', actual: 2.7, previous: 2.7 }] }).message,
  'The same as the month before. The Fed aims for 2%.',
);

assert.deepEqual(
  english({
    kind: 'jobs',
    verdict: null,
    results: [{ key: 'payrolls', actual: 142, previous: 120 }, { key: 'unemployment', actual: 4.1, previous: 4.2 }],
  }),
  { title: 'The economy added 142,000 jobs last month', message: 'Unemployment was 4.1%. Down from 4.2% the month before.' },
);
assert.equal(english({ kind: 'jobs', verdict: null, results: [{ key: 'payrolls', actual: -20, previous: 50 }] }).title, 'The economy lost 20,000 jobs last month');

assert.deepEqual(english({ kind: 'gdp', verdict: null, results: [{ key: 'gdp', actual: -0.5, previous: 1.6 }] }), {
  title: 'The economy shrank at a 0.5% yearly pace last quarter',
  message: 'Down from 1.6% the quarter before. That figure is adjusted for inflation.',
});

// A result without its headline says nothing rather than something wrong.
assert.equal(economicResultText({ id: 'x', kind: 'cpi', verdict: null, results: [{ key: 'core_cpi_yoy', actual: 3, previous: 3 }] }), null);

// The reward screen after the two macro lessons (read or its check) links to the live numbers.
assert.equal(economyLinkForLesson('macro-basics', 'the-big-four-macro-forces'), '/tools/economy');
assert.equal(economyLinkForLesson('macro-mechanics', 'discount-rate-growth-vs-value-check'), '/tools/economy/fed-rate');
assert.equal(economyLinkForLesson('macro-basics', 'macro-basics-quiz'), null);

console.log('economic verdicts: ok');
