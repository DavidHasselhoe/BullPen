import { APICallError } from 'ai';

/**
 * Turns a provider-level error into a short, user-safe message. The AI SDK's
 * default error formatter just does `error.message` (or JSON.stringify for
 * non-Error values) with no sanitization — and @ai-sdk/openai's APICallError
 * embeds the raw upstream response body in `.message`, so an OpenAI 429 like
 * "Rate limit reached for gpt-4o in organization org-... tokens per min (TPM):
 * Limit 30000, Used 24998..." would otherwise reach the chat UI verbatim.
 * Always logs the full raw error server-side before returning the safe copy.
 */
export function toSafeErrorMessage(error: unknown): string {
  console.error('[ai] stream error:', error);

  if (APICallError.isInstance(error)) {
    if (error.statusCode === 429) {
      return 'BullPen AI is handling a lot of requests right now. Please try again in a few seconds.';
    }
    if (error.statusCode != null && error.statusCode >= 500) {
      return 'The AI service is temporarily unavailable. Please try again shortly.';
    }
  }
  return 'Something went wrong generating a response. Please try again.';
}
