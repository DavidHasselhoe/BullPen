import { APICallError } from 'ai';

/** Stable, localizable codes — mapped to real copy client-side (BullpenChat's
 *  friendlyChatError). Not the message text itself: this runs server-side
 *  with no access to the user's language, and used to return hardcoded
 *  English sentences that reached the chat UI verbatim regardless of locale. */
export type SafeErrorCode = 'rate_limited' | 'unavailable' | 'generic';

/**
 * Turns a provider-level error into a short, user-safe code. The AI SDK's
 * default error formatter just does `error.message` (or JSON.stringify for
 * non-Error values) with no sanitization — and @ai-sdk/openai's APICallError
 * embeds the raw upstream response body in `.message`, so an OpenAI 429 like
 * "Rate limit reached for gpt-4o in organization org-... tokens per min (TPM):
 * Limit 30000, Used 24998..." would otherwise reach the chat UI verbatim.
 * Always logs the full raw error server-side before returning the safe copy.
 */
export function toSafeErrorMessage(error: unknown): SafeErrorCode {
  console.error('[ai] stream error:', error);

  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) return 'rate_limited';
    if (error.statusCode != null && error.statusCode >= 500) return 'unavailable';
  }
  return 'generic';
}
