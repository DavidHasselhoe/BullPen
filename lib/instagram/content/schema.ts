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
  /** Set for an off-schedule special edition (e.g. "Pre-Market") — undefined
   *  for the regular post-close 3x/week post, which reads as "Daily". */
  sessionLabel?: string;
  winners: MarketMoverEntry[]; // exactly 10, sorted descending by changePercent
  losers: MarketMoverEntry[]; // exactly 10, sorted ascending by changePercent (most negative first)
  caption: string;
}

/**
 * Single-company earnings deep-dive carousel — unlike the multi-company
 * calendar/results posts above, this is triggered on demand for one ticker
 * the moment its report actually drops (see lib/edgar/edgar-watch.ts), not
 * on a weekly cron. A 'draft' row is staged ahead of the report with only
 * the *_estimate fields populated (from earnings-deep-dive-estimates.ts);
 * the EDGAR watcher fills in every *_actual field and flips status to
 * 'ready' once the real press release is parsed. Every *_estimate/*_actual
 * pair is nullable independently since either half can legitimately be
 * unconfirmed (no analyst consensus for a given line item; a metric the
 * company doesn't break out that quarter).
 */
export interface EarningsDeepDiveData {
  contentType: 'earnings_deep_dive';
  ticker: string;
  companyName: string;
  logoUrl: string | null;
  reportDate: string; // YYYY-MM-DD
  reportTiming: 'BMO' | 'AMC' | null;

  // Hero / EPS
  epsEstimate: number | null;
  epsActual: number | null;
  epsStatus: 'beat' | 'missed' | 'inline' | null;
  epsSurprisePercent: number | null;

  // Revenue
  revenueEstimate: number | null; // dollars
  revenueActual: number | null;
  revenueStatus: 'beat' | 'missed' | 'inline' | null;
  revenueYoyGrowthPercent: number | null;
  segmentLabel: string | null; // e.g. "Data Center"
  segmentRevenueActual: number | null;
  segmentYoyGrowthPercent: number | null;

  // Profitability
  grossMarginActualPercent: number | null;
  grossMarginPriorQuarterPercent: number | null;
  secondaryMetricLabel: string | null; // e.g. "Free Cash Flow", "Operating Margin"
  secondaryMetricValue: number | null;
  secondaryMetricIsCurrency: boolean;

  // Guidance (next quarter)
  guidanceRevenueLow: number | null;
  guidanceRevenueHigh: number | null;
  guidanceConsensus: number | null;
  whyThisMatters: string | null; // one-liner, Claude-written, grounded in the resolved fields

  // Market reaction (optional — filled in later once after-hours data settles)
  afterHoursChangePercent: number | null;

  headline: string | null;
  caption: string | null;
}

export interface EarningsDeepDiveSlides {
  contentType: 'earnings_deep_dive';
  data: EarningsDeepDiveData;
}

/** Every shape instagram_posts.slides can hold, keyed by contentType. */
export type InstagramPostSlides = EarningsCalendarSlides | EarningsResultsSlides | MarketMoversSlides | EarningsDeepDiveSlides;
