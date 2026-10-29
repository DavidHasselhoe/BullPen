/**
 * Self-check: a Yes/No or Confirm/Cancel answer reaches the tool result Bull
 * reads next turn (lib/ai/tool-ux.ts withUserResponse + cardResponses).
 * Run: npx tsx scripts/test-card-responses.ts
 */
import assert from 'node:assert/strict';
import { cardResponses, withUserResponse } from '@/lib/ai/tool-ux';

const messages = [
  { id: 'u1', role: 'user', parts: [{ type: 'text', text: 'which stocks have strong fundamentals?' }] },
  {
    id: 'a1',
    role: 'assistant',
    parts: [
      { type: 'step-start' },
      { type: 'tool-screenStocks', state: 'output-available', output: { results: [] } },
      {
        type: 'tool-openScreener',
        state: 'output-available',
        output: { note: 'The user now sees Yes/No buttons under your reply. They have not moved.', __clientAction: { type: 'navigate', path: '/tools/screener', requiresConfirmation: true } },
      },
      { type: 'text', text: 'Want me to open the screener?' },
    ],
  },
];

// Key index 1 = second completed tool call on a1, as BullpenChat keys it.
const responses = cardResponses({ 'a1::1': 'declined' }, { 'x::0': { status: 'pending' } });
assert.deepEqual(Object.keys(responses), ['a1::1'], 'pending outcomes produce no response');

const out = Object.entries(responses).reduce((m, [k, r]) => withUserResponse(m, k, r), messages);
const nav = out[1].parts[2] as { output: Record<string, unknown> };
assert.match(String(nav.output.userResponse), /pressed No/);
assert.equal(nav.output.note, undefined, 'stale "they see Yes/No buttons" note is dropped');
assert.ok(nav.output.__clientAction, 'client action kept so the card still renders');
assert.deepEqual(out[1].parts[1], messages[1].parts[1], 'other tool results untouched');
assert.equal(messages[1].parts[2].output && 'note' in (messages[1].parts[2].output as object), true, 'input not mutated');

const cancelled = cardResponses({}, { 'a1::0': { status: 'cancelled' } });
assert.match(cancelled['a1::0'], /pressed Cancel/);

console.log('ok - card answers reach the tool result');
