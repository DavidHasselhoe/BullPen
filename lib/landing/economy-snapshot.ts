/**
 * The landing Economy card's numbers: the latest Fed range, CPI and jobs
 * report, read the same way /tools/economy reads them (getEconomyPage, our
 * own FRED-backed tables). The card used to hard-code a 2026-11-02 capture,
 * so it kept showing September inflation after October's was out.
 *
 * Cached in Redis for 6 hours: the page renders per request, and these
 * numbers change a few times a month. No market-data credits, no AI.
 */

import { rget, rset } from '@/lib/cache/redis-cache';
import { getEconomyPage, type EconomyPageData, type MetricKey } from '@/lib/market-data/economic-results';

export interface LandingEconomy {
  /** YYYY-MM-DD of the newest of the three releases. */
  asOf: string;
  fed: { lower: number; upper: number };
  /**
   * period: YYYY-MM-01. actual/previous: percent over the past year, or over
   * the past month (basis 'month') when a year-ago index is missing, as for
   * October 2026 (FRED has no October 2025 CPI, the shutdown). /tools/economy
   * falls back the same way.
   */
  cpi: { period: string; basis: 'year' | 'month'; actual: number; previous: number | null };
  /** period: YYYY-MM-01. actual/previous: jobs added that month, in thousands. */
  jobs: { period: string; actual: number; previous: number | null };
}

const KEY = 'landing:economy:v2';
const TTL_SECONDS = 6 * 60 * 60;

const metric = (page: EconomyPageData, key: MetricKey) => page.latest?.metrics.find((m) => m.key === key);

async function build(): Promise<LandingEconomy | null> {
  const [fomc, cpi, jobs] = await Promise.all([getEconomyPage('fomc'), getEconomyPage('cpi'), getEconomyPage('jobs')]);
  const upper = metric(fomc, 'rate_upper');
  const lower = metric(fomc, 'rate_lower');
  const cpiMetric = metric(cpi, 'cpi_yoy') ?? metric(cpi, 'cpi_mom');
  const payrolls = metric(jobs, 'payrolls');
  if (!upper || !lower || !cpiMetric || !payrolls || !cpi.latest || !jobs.latest) return null;
  const asOf = [fomc, cpi, jobs]
    .map((p) => p.lastRelease?.date)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
  if (!asOf) return null;
  return {
    asOf,
    fed: { lower: lower.actual, upper: upper.actual },
    cpi: { period: cpi.latest.period, basis: cpiMetric.key === 'cpi_yoy' ? 'year' : 'month', actual: cpiMetric.actual, previous: cpiMetric.previous },
    jobs: { period: jobs.latest.period, actual: payrolls.actual, previous: payrolls.previous },
  };
}

/** Never throws: the card falls back to its stored example when this is null. */
export async function getLandingEconomy(): Promise<LandingEconomy | null> {
  try {
    const cached = await rget<LandingEconomy>(KEY);
    if (cached) return cached;
    const fresh = await build();
    if (fresh) void rset(KEY, fresh, TTL_SECONDS);
    return fresh;
  } catch (err) {
    console.error('[landing-economy] failed:', err);
    return null;
  }
}
