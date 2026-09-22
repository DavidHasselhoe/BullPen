/**
 * Assert-based check for toSafeErrorMessage. No framework.
 *   npx tsx scripts/test-ai-error-classification.ts
 *
 * Pinned to the payloads actually seen in production (Vercel runtime errors,
 * /api/ai/chat, 2026-07-16 to 2026-09-21). The one that mattered: when the
 * token-per-minute limit is hit after the stream has already opened, OpenAI
 * keeps the 200 and sends an error *event*, which is a plain object rather
 * than an APICallError. That fell through to 'generic', so a user who was
 * merely too early got "Something went wrong" instead of being told to wait.
 */

import assert from 'node:assert/strict';
import { APICallError } from 'ai';
import { parseRetryAfterSeconds, toSafeErrorMessage } from '../lib/ai/error-utils';

// Silence the module's own server-side logging for the duration of the run.
const realError = console.error;
console.error = () => {};

try {
  // ── The real in-stream event, verbatim from the logs ─────────────────────
  const inStream = {
    type: 'error',
    sequence_number: 2,
    error: {
      type: 'tokens',
      code: 'rate_limit_exceeded',
      message:
        'Rate limit reached for gpt-4o in organization org-Dsi9gaPjzfTQ2P5GwrT9PHLt on tokens per min (TPM): ' +
        'Limit 30000, Used 23301, Requested 12307. Please try again in 11.216s. ' +
        'Visit https://platform.openai.com/account/rate-limits to learn more.',
      param: null,
    },
  };
  assert.equal(toSafeErrorMessage(inStream), 'rate_limited:12', 'in-stream TPM error is a rate limit, and 11.216s rounds up');

  // The other two from the same log group, both quoting a longer wait.
  const longerWait = {
    type: 'error',
    error: { type: 'tokens', code: 'rate_limit_exceeded', message: 'Rate limit reached ... Please try again in 26.098s.' },
  };
  assert.equal(toSafeErrorMessage(longerWait), 'rate_limited:27');

  // ── The shape that already worked, which must keep working ───────────────
  const apiError = new APICallError({
    message: 'Rate limit reached for gpt-4o. Please try again in 3s.',
    url: 'https://api.openai.com/v1/chat/completions',
    requestBodyValues: {},
    statusCode: 429,
  });
  assert.equal(toSafeErrorMessage(apiError), 'rate_limited:3', 'an outright 429 still classifies, now with its wait');

  const serverError = new APICallError({
    message: 'Bad gateway',
    url: 'https://api.openai.com/v1/chat/completions',
    requestBodyValues: {},
    statusCode: 502,
  });
  assert.equal(toSafeErrorMessage(serverError), 'unavailable');

  // ── Everything else stays generic, and stays opaque ──────────────────────
  assert.equal(toSafeErrorMessage(new Error('Cannot read properties of undefined')), 'generic');
  assert.equal(toSafeErrorMessage(null), 'generic');
  assert.equal(toSafeErrorMessage({ nested: { deeply: { nothing: true } } }), 'generic');

  // A rate limit with no quotable wait degrades to the plain code rather than
  // inventing a number.
  assert.equal(toSafeErrorMessage({ code: 'rate_limit_exceeded', message: 'slow down' }), 'rate_limited');

  // ── Wait parsing ─────────────────────────────────────────────────────────
  assert.equal(parseRetryAfterSeconds('Please try again in 11.216s.'), 12, 'rounds up, never early');
  assert.equal(parseRetryAfterSeconds('Please try again in 1ms.'), 1, 'sub-second still waits a second');
  assert.equal(parseRetryAfterSeconds('Please try again in 600s.'), null, 'an implausible wait is not quoted');
  assert.equal(parseRetryAfterSeconds('no wait mentioned'), null);

  // No raw provider text may survive classification: an org id reaching the
  // chat UI is what the sanitizer exists to prevent.
  for (const out of [toSafeErrorMessage(inStream), toSafeErrorMessage(apiError)]) {
    assert.ok(!out.includes('org-'), 'no organization id in the returned code');
    assert.ok(out.length < 32, 'the code stays a code, not prose');
  }

  console.log('ok - in-stream TPM rate limits now classify as rate_limited, with the wait attached');
} finally {
  console.error = realError;
}
