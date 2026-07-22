/**
 * Turns a caught AI-provider error (Anthropic, OpenAI via the Vercel AI SDK, or a
 * JSON.parse failure on a model's structured output) into a code + message that are
 * safe to send to the client.
 *
 * Raw provider errors can contain account/billing details (e.g. Anthropic's
 * "Your credit balance is too low to access the Anthropic API") or other internal
 * information that must never reach an end user. Every AI route should log the raw
 * `err` itself via console.error and pass only this function's output to the client.
 */

export type AiErrorCode = 'invalid_key' | 'payment_required' | 'rate_limited' | 'parse_failed' | 'unknown';

const SAFE_MESSAGES: Record<AiErrorCode, string> = {
  invalid_key: 'This AI feature is temporarily unavailable. Please try again shortly.',
  payment_required: 'This AI feature is temporarily unavailable. Please try again shortly.',
  rate_limited: "You're sending requests too quickly. Please wait a moment and try again.",
  parse_failed: 'The AI returned an unexpected response. Please try again.',
  unknown: 'Something went wrong generating this. Please try again.',
};

const SAFE_STATUS: Record<AiErrorCode, number> = {
  invalid_key: 503,
  payment_required: 503,
  rate_limited: 429,
  parse_failed: 500,
  unknown: 500,
};

export function classifyAiError(err: unknown): { code: AiErrorCode; message: string; status: number } {
  const status =
    (err as { status?: number; statusCode?: number } | null | undefined)?.status ??
    (err as { status?: number; statusCode?: number } | null | undefined)?.statusCode;
  const rawMessage = err instanceof Error ? err.message : '';

  const code: AiErrorCode =
    status === 401 ? 'invalid_key'
    : status === 402 || /credit balance|insufficient_quota|billing/i.test(rawMessage) ? 'payment_required'
    : status === 429 ? 'rate_limited'
    : 'unknown';

  return { code, message: SAFE_MESSAGES[code], status: SAFE_STATUS[code] };
}

/** For JSON.parse failures on a model's structured output — never forwards the parser's raw message. */
export function parseFailure(): { code: AiErrorCode; message: string; status: number } {
  return { code: 'parse_failed', message: SAFE_MESSAGES.parse_failed, status: SAFE_STATUS.parse_failed };
}
