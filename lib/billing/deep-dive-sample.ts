import type { DeepDiveReport } from '@/lib/ai/deep-dive/schema';
import report from './deep-dive-sample.json';

/**
 * The real report the Deep Dive paywall shows as its sample: Alphabet,
 * generated 2026-10-29 on David's own account (stock_deep_dives
 * 3eecbb7e-214f-420a-8c22-33e58d6ac41a), copied here byte for byte.
 *
 * A fixed file, never a live read of someone's stored report: reports belong
 * to one user and can carry their portfolio fit (their holdings). To refresh
 * it, take a newer report from an internal account with no `portfolioFit`
 * and run `npx tsx scripts/test-deep-dive-sample.ts`.
 */
export const DEEP_DIVE_SAMPLE = report as unknown as DeepDiveReport;
