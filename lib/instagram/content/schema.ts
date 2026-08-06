import { z } from 'zod';

/**
 * Claude only ever writes the two fields below — every factual detail
 * (tickers, company names, dates, times) is assembled from real data before
 * the model is called (see earnings-calendar.ts) and never re-derived from
 * its output. This schema exists purely to validate the creative copy.
 */
export const HookAndCaptionSchema = z.object({
  headline: z.string().min(1).max(120),
  caption: z.string().min(1).max(2200), // Instagram's own caption length cap
});

export type HookAndCaption = z.infer<typeof HookAndCaptionSchema>;

/** Strip markdown fences the model sometimes adds despite instructions. */
export function stripFences(raw: string): string {
  return raw
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/i, '');
}

/** Find the first {...} JSON object in a blob — last-resort recovery if the model adds prose. */
export function extractJsonObject(raw: string): string {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return raw;
  return raw.slice(start, end + 1);
}

/** Parse + validate the model's hook/caption output. Throws a descriptive error on failure. */
export function parseHookAndCaption(raw: string): HookAndCaption {
  if (!raw || raw.trim().length === 0) {
    throw new Error('Model returned empty response');
  }

  const stripped = stripFences(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    const extracted = extractJsonObject(stripped);
    try {
      parsed = JSON.parse(extracted);
    } catch (innerErr) {
      throw new Error(
        `JSON parse failed. Raw (first 300 chars): ${stripped.slice(0, 300)}. Error: ${innerErr}`
      );
    }
  }

  const result = HookAndCaptionSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`Schema validation failed: ${result.error.message}`);
  }
  return result.data;
}

/**
 * One earnings-calendar slide row — real data only, never LLM-derived.
 * Shape stored verbatim in instagram_posts.slides for the 'earnings_calendar'
 * content type.
 */
export interface EarningsSlideCompany {
  symbol: string;
  name: string;
  date: string; // YYYY-MM-DD
  time: 'BMO' | 'AMC' | null;
  marketCap: number | null;
}

export interface EarningsCalendarSlides {
  contentType: 'earnings_calendar';
  headline: string;
  weekLabel: string; // e.g. "Aug 10-14, 2026"
  companies: EarningsSlideCompany[];
  overflowCount: number; // companies beyond what fits on the list slides
  caption: string;
}
