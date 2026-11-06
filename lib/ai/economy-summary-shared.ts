/** Client-safe half of lib/ai/economy-summary.ts. */

export interface EconomySummary {
  headline: string;
  rates: string;
  inflation: string;
  jobs: string;
  growth: string;
  watch: string;
}

export type EconomySummaryResponse =
  | { status: 'ready'; summary: EconomySummary; generatedAt: string }
  /** Being written; `previous` is the last one, written from older numbers. */
  | { status: 'pending'; previous: (EconomySummaryResponse & { status: 'ready' }) | null }
  | { status: 'unavailable' };
