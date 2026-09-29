/** Client-safe half of lib/ai/why-today.ts (that one holds the Anthropic client). */

/** Home explains only moves at least this large (percent). Smaller ones are
 *  usually noise, and each explanation is a paid web search. */
export const WHY_TODAY_MIN_MOVE = 2;

/** One ticker's answer from /api/ai/why-today/inline. */
export type InlineWhy =
  | { status: 'ready'; text: string; changePct: number }
  | { status: 'pending' }
  | { status: 'skipped' };
