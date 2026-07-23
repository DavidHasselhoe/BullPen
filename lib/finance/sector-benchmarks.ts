/**
 * sector-benchmarks — reads the per-industry (preferred) or per-sector
 * (fallback) metric distributions rolled up by migrations 087/088
 * (sector_metric_stats / industry_metric_stats), so the stock page can show
 * "typical for its kind" context instead of only an absolute scale.
 *
 * Industry (e.g. "Software", "Electronic Components") is the more honest
 * peer group than sector (e.g. "Technology") for volatility-sensitive
 * metrics like beta — a broad sector blends very different risk profiles.
 * We only use it when the industry bucket has enough companies (>= 5,
 * enforced by refresh_industry_metric_stats) to be a reliable median;
 * otherwise we degrade to the coarser sector bucket, and finally to no
 * context at all if even that is thin/unknown.
 *
 * The medians are computed from screener_stats (the ~530-stock prefetch
 * universe) with zero extra market-data credits. Values are in screener_stats
 * units: pe/pb/ps/ev/beta are raw ratios, profit_margin & dividend_yield are
 * fractions (0.24 = 24%), *_growth_yoy are percent (×100).
 */

import { createServerClient } from '@/lib/supabase/client';

export type SectorMetricKey =
  | 'pe_ratio'
  | 'forward_pe'
  | 'pb_ratio'
  | 'ps_ratio'
  | 'ev_to_ebitda'
  | 'profit_margin'
  | 'revenue_growth_yoy'
  | 'earnings_growth_yoy'
  | 'beta'
  | 'dividend_yield';

export interface SectorBenchmark {
  p25: number;
  median: number;
  p75: number;
  sampleSize: number;
}

export type SectorBenchmarks = Partial<Record<SectorMetricKey, SectorBenchmark>>;

export type BenchmarkGroupType = 'industry' | 'sector';

export interface BenchmarksResult {
  groupType: BenchmarkGroupType;
  /** The industry or (canonicalized) sector name the benchmarks belong to. */
  groupLabel: string;
  benchmarks: SectorBenchmarks;
}

/**
 * Canonicalize a sector label to the TwelveData taxonomy the stock-page profile
 * uses. MUST stay in sync with public.normalize_sector() in migration 087 —
 * the page's sector is normalized here before matching the rolled-up rows.
 */
export function normalizeSector(s: string | null | undefined): string | null {
  if (!s) return null;
  const t = s.trim();
  if (!t) return null;
  switch (t.toLowerCase()) {
    case 'information technology':
    case 'tech':
      return 'Technology';
    case 'health care':
      return 'Healthcare';
    case 'financials':
      return 'Financial Services';
    case 'consumer discretionary':
      return 'Consumer Cyclical';
    case 'consumer staples':
      return 'Consumer Defensive';
    case 'materials':
      return 'Basic Materials';
    default:
      return t;
  }
}

interface MetricRow {
  metric: string;
  p25: number | null;
  median: number | null;
  p75: number | null;
  sample_size: number;
}

function toBenchmarks(rows: MetricRow[]): SectorBenchmarks {
  const benchmarks: SectorBenchmarks = {};
  for (const row of rows) {
    if (row.median == null || row.p25 == null || row.p75 == null) continue;
    benchmarks[row.metric as SectorMetricKey] = {
      p25: row.p25,
      median: row.median,
      p75: row.p75,
      sampleSize: row.sample_size,
    };
  }
  return benchmarks;
}

/**
 * Fetch the benchmark distribution for a company, preferring its industry
 * bucket and falling back to its sector bucket when industry is unknown or
 * too thin. Returns null when neither yields anything, so callers degrade to
 * the absolute scale.
 */
export async function getBenchmarks(
  sector: string | null | undefined,
  industry: string | null | undefined
): Promise<BenchmarksResult | null> {
  const supabase = createServerClient();

  const trimmedIndustry = industry?.trim();
  if (trimmedIndustry) {
    const { data, error } = await supabase
      .from('industry_metric_stats')
      .select('metric, p25, median, p75, sample_size')
      .eq('industry', trimmedIndustry);

    if (!error && data && data.length > 0) {
      const benchmarks = toBenchmarks(data as MetricRow[]);
      if (Object.keys(benchmarks).length > 0) {
        return { groupType: 'industry', groupLabel: trimmedIndustry, benchmarks };
      }
    }
  }

  const canonical = normalizeSector(sector);
  if (!canonical) return null;

  const { data, error } = await supabase
    .from('sector_metric_stats')
    .select('metric, p25, median, p75, sample_size')
    .eq('sector', canonical);

  if (error || !data || data.length === 0) return null;

  const benchmarks = toBenchmarks(data as MetricRow[]);
  if (Object.keys(benchmarks).length === 0) return null;
  return { groupType: 'sector', groupLabel: canonical, benchmarks };
}
