/**
 * Earnings recap check (lib/ai/earnings-recap.ts, lib/earnings/recap-run.ts).
 *
 *   node --env-file=.env.local --import tsx scripts/test-earnings-recap.ts
 *     Offline: the validator, the email card, the push priority. Free.
 *   ... -- --live AAPL 2026-10-30
 *     Also finds that report's 8-K and press release on EDGAR. Free.
 *   ... -- --live AAPL 2026-10-30 --generate [--model claude-haiku-5-5]
 *     Also writes one recap: a PAID model call (~$0.03 on Sonnet). Prints the
 *     bullets, tokens and cost. Stores nothing, notifies no one.
 */

import assert from 'node:assert/strict';
import { parseRecap, ungroundedNumbers, fetchPressRelease, generateRecap, EARNINGS_RECAP_MODEL } from '@/lib/ai/earnings-recap';
import { toEmailItem } from '@/lib/email/alert-email';
import { PUSH_PRIORITY, planUserPush } from '@/lib/notifications/push-plan';
import { calcCost } from '@/lib/billing/pricing';

const SOURCE = `Apple reports fourth quarter results. Quarterly revenue of $102.5 billion, up 8 percent year over year.
Net sales (in millions) 102,466 94,930. Diluted earnings per share $1.85 $0.97. Services revenue reached an all-time high.
Apple expects revenue growth of 10 to 12 percent in the December quarter.`;

const good = JSON.stringify({ bullets: [
  'Apple brought in $102.5 billion in revenue and earned $1.85 a share.',
  'Revenue was up 8 percent from a year ago, when sales were $94.9 billion.',
  'Apple expects revenue to grow 10 to 12 percent in the December quarter.',
] });

// Grounded: copied, rounded, and millions restated as billions all pass.
assert.deepEqual(ungroundedNumbers(['$102.5 billion', '$94.9 billion', '$1.85', '8 percent'], SOURCE), []);
assert.deepEqual(parseRecap('```json\n' + good + '\n```', SOURCE).bullets?.length, 3);
// An invented figure drops the recap.
assert.deepEqual(ungroundedNumbers(['Profit was $31.7 billion.'], SOURCE), ['31.7']);
assert.match(parseRecap(good.replace('$1.85', '$2.40'), SOURCE).rejected ?? '', /^ungrounded: 2\.40/);
// Shape and copy rules.
assert.equal(parseRecap('not json at all', SOURCE).rejected, 'not json');
assert.equal(parseRecap('{"skip":"deliveries update"}', SOURCE).rejected, 'skip: deliveries update');
assert.equal(parseRecap(JSON.stringify({ bullets: ['Only one.'] }), SOURCE).rejected, '1 bullets');
assert.equal(parseRecap(good.replace('a share.', 'a share — a record.'), SOURCE).rejected, 'dash');
assert.equal(parseRecap(good.replace('a share.', 'a share, ahead of analyst forecasts.'), SOURCE).rejected, 'analyst language');
assert.equal(parseRecap(JSON.stringify({ bullets: ['word '.repeat(50), 'b', 'c'] }), SOURCE).rejected, 'too long');

// Morning email: the recap row becomes an earnings card with the bullets under it, from the evening before too.
const bullets = (JSON.parse(good) as { bullets: string[] }).bullets;
const card = toEmailItem({
  id: '1', user_id: 'u', type: 'earnings', entity_type: 'stock', entity_id: 'AAPL:earnings_recap:2026-10-30',
  title: 'Apple reported its results', message: bullets.join(' '), created_at: '2026-10-30T20:30:00Z',
});
assert.equal(card?.section, 'earnings');
assert.equal(card?.headline, 'Apple (AAPL) reported its results');
assert.equal(card?.why, bullets.join(' '));
assert.equal(card?.href, '/stock/AAPL');
assert.equal(toEmailItem({
  id: '2', user_id: 'u', type: 'earnings', entity_type: 'stock', entity_id: 'ZZZ:earnings_recap:2026-10-30',
  title: 'ZZZ reported its results', message: 'x', created_at: '2026-10-30T20:30:00Z',
})?.headline, 'ZZZ reported its results');

// Push: the recap leads the capped kinds and goes out alone.
assert.ok(PUSH_PRIORITY.indexOf('earnings_recap') < PUSH_PRIORITY.indexOf('upcoming_earnings'));
const plan = planUserPush({
  pending: [{ id: 'r', push_kind: 'earnings_recap', title: 'Apple reported its results', message: bullets.join(' '), href: '/stock/AAPL', created_at: new Date().toISOString(), is_read: false }],
  pushed: [], timeZone: 'America/New_York', now: new Date('2026-10-30T21:00:00Z'),
});
assert.equal(plan.action, 'send');
console.log('offline checks ok');

const argv = process.argv.slice(2);
const live = argv.indexOf('--live');
async function liveCheck(): Promise<void> {
  const [symbol, date] = [argv[live + 1]?.toUpperCase(), argv[live + 2]];
  assert.ok(symbol && /^\d{4}-\d{2}-\d{2}$/.test(date ?? ''), 'usage: --live SYM YYYY-MM-DD');
  const pr = await fetchPressRelease(symbol, date);
  if (!pr) { console.log(`${symbol}: no earnings 8-K within a day of ${date}`); return; }
  console.log(`${symbol}: 8-K ${pr.filing.accessionNumber} accepted ${pr.filing.acceptanceDateTime}`);
  console.log(`release ${pr.url ?? '(none)'}: ${pr.text?.length ?? 0} chars`);
  if (argv.includes('--generate') && pr.text) {
    const model = argv.includes('--model') ? argv[argv.indexOf('--model') + 1] : EARNINGS_RECAP_MODEL;
    const started = Date.now();
    const gen = await generateRecap(symbol, symbol, pr.text, model);
    const cost = calcCost(model, gen.inputTokens, gen.outputTokens);
    console.log(`${model}: ${gen.inputTokens} in / ${gen.outputTokens} out, $${cost.toFixed(4)}, ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.log(gen.bullets ? gen.bullets.map((b) => `  • ${b}`).join('\n') : `  rejected: ${gen.rejected}`);
  }
}
if (live >= 0) liveCheck().catch((err) => { console.error(err); process.exit(1); });
