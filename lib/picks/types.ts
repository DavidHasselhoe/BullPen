/**
 * Shared shapes for Bull's Weekly Pick, used by the API routes and every client
 * component. The split between `PickSummary` and `PickDetail` is the tier
 * boundary: everything in the summary is free, `thesis`/`risks` are Pro.
 */

import type { CatalystType, Horizon, PickRisk, StoredThesis } from '@/lib/ai/picks/schema';

export type { CatalystType, Horizon, PickRisk, StoredThesis };
export { CATALYST_LABELS, HORIZON_LABELS } from '@/lib/ai/picks/schema';

/** Below this many picks we don't publish a headline return figure. */
export const MIN_PICKS_FOR_HEADLINE = 8;

/** Dollars notionally invested in each pick. Only the ratio matters. */
export const DOLLARS_PER_PICK = 100;

export interface PickSummary {
  pickDate: string;              // YYYY-MM-DD
  symbol: string;
  companyName: string | null;
  logoUrl: string | null;
  sector: string | null;
  headline: string;
  oneLiner: string;
  catalystType: CatalystType;
  conviction: number;
  horizon: Horizon;
  /** Null until the first regular session on/after pickDate has opened. */
  entryPrice: number | null;
  status: 'published' | 'closed';
  closePrice: number | null;
  closeDate: string | null;
  closeReason: string | null;
}

/** A pick plus its live performance. */
export interface PickWithPerformance extends PickSummary {
  currentPrice: number | null;
  /** % return from entryPrice. Null while the entry is unstamped. */
  returnPct: number | null;
  /** SPY's % return over the same window, same entry date. */
  benchmarkReturnPct: number | null;
}

export interface PickDetail extends PickWithPerformance {
  /** Present only for Pro. Free responses omit these entirely. */
  thesis?: StoredThesis;
  risks?: PickRisk[];
  metricsSnapshot?: Record<string, unknown>;
  model: string;
  generatedAt: string;
  /** True when the viewer's tier doesn't include the thesis. */
  locked: boolean;
}

// ─── Performance series ──────────────────────────────────────────────────────

export interface SeriesPoint {
  /** Unix seconds, market close of that day. */
  t: number;
  /** Cumulative % return of the simulated equal-dollar pick portfolio. */
  picksPct: number;
  /** SPY bought on the identical schedule, same % basis. */
  benchmarkPct: number;
  /** How many picks were live on this day — drives the "N picks" annotation. */
  liveCount: number;
}

export interface NormalizedPoint {
  /** Calendar days since each pick's own pick date. */
  day: number;
  /** Mean % return across every pick that has reached this age. */
  avgPct: number;
  /** Median, which a single outlier can't drag. */
  medianPct: number;
  /** How many picks are in this bucket. Printed on the axis. */
  n: number;
}

export interface PerformanceSummary {
  pickCount: number;
  /** Picks with a stamped entry price — the ones actually in the maths. */
  trackedCount: number;
  trackingSince: string | null;
  totalReturnPct: number | null;
  benchmarkReturnPct: number | null;
  outperformancePct: number | null;
  /** Picks currently in the green, out of trackedCount. */
  winners: number;
  hitRatePct: number | null;
  bestPick: { symbol: string; returnPct: number } | null;
  worstPick: { symbol: string; returnPct: number } | null;
  /** True below MIN_PICKS_FOR_HEADLINE — the UI suppresses the headline number. */
  insufficientSample: boolean;
}

export interface PerformanceResponse {
  series: SeriesPoint[];
  normalized: NormalizedPoint[];
  summary: PerformanceSummary;
  picks: PickWithPerformance[];
}
