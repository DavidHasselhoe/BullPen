/**
 * One Yes/No card per destination in a reply. Run: npm run test-navigate-dedupe
 */
import assert from 'node:assert/strict';
import { getCompletedToolCalls } from '../lib/ai/tool-ux';

const nav = (path: string) => ({ __clientAction: { type: 'navigate', path, label: path, requiresConfirmation: true } });
const calls = getCompletedToolCalls({
  parts: [
    { type: 'tool-getUpcomingEarnings', state: 'output-available', output: { upcoming: [], ...nav('/tools/calendar') } },
    { type: 'tool-navigateTo', state: 'output-available', output: nav('/tools/calendar') },
    { type: 'tool-navigateTo', state: 'output-available', output: nav('/watchlist') },
  ],
});

assert.equal(calls.length, 3, 'every call is still listed');
assert.equal(calls[0].clientAction?.type, 'navigate', 'the first calendar offer keeps its card');
assert.equal(calls[1].clientAction, undefined, 'the repeat calendar offer loses its card');
assert.equal(calls[2].clientAction?.type, 'navigate', 'a different destination keeps its card');

console.log('test-navigate-dedupe: ok');
