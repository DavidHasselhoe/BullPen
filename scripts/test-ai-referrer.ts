/**
 * Visits from AI assistants get tagged, everything else does not. Free.
 *
 *   npm run test-ai-referrer
 */
import assert from 'node:assert/strict';
import { aiSource } from '../lib/analytics/ai-referrer';

assert.equal(aiSource('https://chatgpt.com/', null), 'chatgpt');
assert.equal(aiSource('', 'chatgpt.com'), 'chatgpt'); // ChatGPT's links carry utm_source even when the referrer is stripped
assert.equal(aiSource('', 'ChatGPT'), 'chatgpt');
assert.equal(aiSource('https://www.perplexity.ai/search?q=x', null), 'perplexity');
assert.equal(aiSource('https://gemini.google.com/app', null), 'gemini');
assert.equal(aiSource('https://copilot.microsoft.com/', null), 'copilot');
assert.equal(aiSource('https://claude.ai/chat/1', null), 'claude');

// Not AI: search, social, our own pages, nothing, junk.
assert.equal(aiSource('https://www.google.com/', null), null);
assert.equal(aiSource('https://l.instagram.com/', 'ig'), null);
assert.equal(aiSource('https://bullpeninvest.com/stocks', null), null);
assert.equal(aiSource('', null), null);
assert.equal(aiSource('not a url', null), null);
// Facebook and Instagram ads are tagged utm_source=meta: not Meta AI.
assert.equal(aiSource('', 'meta'), null);
assert.equal(aiSource('https://www.meta.ai/', null), 'meta-ai');
// A lookalike domain is not the assistant.
assert.equal(aiSource('https://notchatgpt.com.evil.example/', null), null);

console.log('ai referrer: ok');
