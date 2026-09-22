import { APICallError } from 'ai';

/** Stable, localizable codes — mapped to real copy client-side (BullpenChat's
 *  friendlyChatError). Not the message text itself: this runs server-side
 *  with no access to the user's language, and used to return hardcoded
 *  English sentences that reached the chat UI verbatim regardless of locale.
 *
 *  `rate_limited` may carry the wait OpenAI asked for, as `rate_limited:12`,
 *  so the UI can say how long rather than just "try again". */
export type SafeErrorCode = 'rate_limited' | 'unavailable' | 'generic';

/** Longest wait worth quoting. Past this the number stops being reassuring
 *  and the plain "busy" message reads better. */
const MAX_QUOTED_WAIT_SECONDS = 60;

/**
 * OpenAI puts the wait in prose: "Please try again in 11.216s." Rounded up,
 * because telling someone 11 seconds when it is 11.216 sends them back a
 * fraction of a second early, into the same error.
 */
export function parseRetryAfterSeconds(text: string): number | null {
  const match = text.match(/try again in ([\d.]+)\s*(ms|s)\b/i);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;
  const seconds = match[2].toLowerCase() === 'ms' ? value / 1000 : value;
  const rounded = Math.ceil(seconds);
  return rounded > 0 && rounded <= MAX_QUOTED_WAIT_SECONDS ? rounded : null;
}

/**
 * Whether this is a rate limit, whatever shape it arrived in.
 *
 * There are two, and only one of them used to be recognised. A request
 * rejected outright comes back as an APICallError with statusCode 429. But
 * when the limit is hit *after* the stream has already opened, OpenAI keeps
 * the 200 and emits an error event inside the stream instead:
 *
 *   { type: 'error', sequence_number: 2,
 *     error: { type: 'tokens', code: 'rate_limit_exceeded', message: '...' } }
 *
 * That is a plain object, not an APICallError, so it fell through to
 * 'generic' and the user was told "Something went wrong" for what is really
 * "too busy, wait a few seconds". It is also the common case here rather than
 * the exotic one: it is what a second step trips, after a tool call, when the
 * first step already spent most of the per-minute token budget.
 */
function findRateLimitText(error: unknown, depth = 0): string | null {
  if (depth > 4 || error == null) return null;

  if (typeof error === 'string') {
    return /rate[_ ]limit|429|too many requests/i.test(error) ? error : null;
  }

  if (APICallError.isInstance(error) && error.statusCode === 429) {
    return error.message ?? 'rate_limited';
  }

  if (typeof error === 'object') {
    const record = error as Record<string, unknown>;

    const code = typeof record.code === 'string' ? record.code : '';
    const type = typeof record.type === 'string' ? record.type : '';
    const message = typeof record.message === 'string' ? record.message : '';

    if (/rate_limit/i.test(code) || /rate[_ ]limit/i.test(message) || type === 'tokens') {
      return message || code || 'rate_limited';
    }

    // The interesting part is usually nested one level down, under `error`
    // for a stream event or `cause` for a wrapped throw.
    for (const key of ['error', 'cause', 'data', 'body']) {
      const nested = findRateLimitText(record[key], depth + 1);
      if (nested) return nested;
    }
  }

  return null;
}

/**
 * Turns a provider-level error into a short, user-safe code. The AI SDK's
 * default error formatter just does `error.message` (or JSON.stringify for
 * non-Error values) with no sanitization — and @ai-sdk/openai's APICallError
 * embeds the raw upstream response body in `.message`, so an OpenAI 429 like
 * "Rate limit reached for gpt-4o in organization org-... tokens per min (TPM):
 * Limit 30000, Used 24998..." would otherwise reach the chat UI verbatim.
 * Always logs the full raw error server-side before returning the safe copy.
 */
export function toSafeErrorMessage(error: unknown): string {
  console.error('[ai] stream error:', error);

  const rateLimitText = findRateLimitText(error);
  if (rateLimitText) {
    const wait = parseRetryAfterSeconds(rateLimitText);
    return wait ? `rate_limited:${wait}` : 'rate_limited';
  }

  if (APICallError.isInstance(error)) {
    if (error.statusCode != null && error.statusCode >= 500) return 'unavailable';
  }
  return 'generic';
}
