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
  /** Consensus/analyst EPS estimate for this report, sourced the same way
   *  as date/time (Claude web search, grounded in real analyst estimates —
   *  see earnings-web-search.ts) — never the model's own guess. Null when
   *  no estimate could be confirmed. */
  epsEstimate: number | null;
  marketCap: number | null;
  /** Resolved once at generation time via /api/logo/[ticker] (the same
   *  self-healing proxy CompanyLogo uses elsewhere in the app) — null when
   *  no logo could be resolved. Pre-resolving here means the render route
   *  only ever sees a known-good URL or null, never has to follow a
   *  redirect or handle a 404 itself. */
  logoUrl: string | null;
}

export interface EarningsCalendarSlides {
  contentType: 'earnings_calendar';
  headline: string;
  weekLabel: string; // e.g. "Aug 10-14, 2026"
  companies: EarningsSlideCompany[];
  overflowCount: number; // companies beyond what fits on the list slides
  caption: string;
}

/**
 * One earnings-results slide row — the Saturday "how did the week go"
 * recap's companion to EarningsSlideCompany above. Only ever built from a
 * company with BOTH a confirmed estimate and a confirmed actual (see
 * earnings-results.ts) — unlike the forward-looking calendar, there's no
 * "N/A, check back later" state here, so epsEstimate/epsActual are
 * non-nullable.
 */
export interface EarningsResultCompany {
  symbol: string;
  name: string;
  date: string; // YYYY-MM-DD, the report date
  time: 'BMO' | 'AMC' | null;
  epsEstimate: number;
  epsActual: number;
  /** eps_actual vs eps_estimate surprise, as a percent. Null on the rare
   *  case where a fallback source confirmed actual/estimate but not the
   *  precomputed surprise — the badge status below never depends on it. */
  surprisePercent: number | null;
  /** actual >= estimate, the same rule components/stock/EarningsCalendar.tsx
   *  already uses in-app for its beat/miss streak — a company that met the
   *  number exactly counts as a beat there, so it does here too. */
  status: 'beat' | 'missed';
  marketCap: number | null;
  logoUrl: string | null;
}

export interface EarningsResultsSlides {
  contentType: 'earnings_results';
  headline: string;
  weekLabel: string; // e.g. "Aug 17-21, 2026"
  companies: EarningsResultCompany[];
  beatCount: number;
  missedCount: number;
  overflowCount: number; // companies beyond what fits on the list slides
  caption: string;
}

/**
 * One Market Movers row — real TwelveData quote data only, never
 * LLM-derived. Shape stored verbatim in instagram_posts.slides for the
 * 'market_movers' content type.
 */
export interface MarketMoverEntry {
  symbol: string;
  name: string;
  changePercent: number; // signed: +13.70 or -8.60
  price: number;
  logoUrl: string | null;
}

export interface MarketMoversSlides {
  contentType: 'market_movers';
  dateLabel: string; // e.g. "Aug 24, 2026"
  winners: MarketMoverEntry[]; // exactly 10, sorted descending by changePercent
  losers: MarketMoverEntry[]; // exactly 10, sorted ascending by changePercent (most negative first)
  caption: string;
}

/** Every shape instagram_posts.slides can hold, keyed by contentType. */
export type InstagramPostSlides = EarningsCalendarSlides | EarningsResultsSlides | MarketMoversSlides;
