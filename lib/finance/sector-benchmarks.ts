/**
 * sector-benchmarks — reads the per-sector metric distributions rolled up by
 * migration 087 (sector_metric_stats), so the stock page can show "typical for
 * its sector" context instead of only an absolute scale.
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

export interface SectorBenchmarksResult {
  /** The canonical sector these benchmarks belong to. */
  sector: string;
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

interface SectorMetricRow {
  metric: string;
  p25: number | null;
  median: number | null;
  p75: number | null;
  sample_size: number;
}

/**
 * Fetch the benchmark distribution for a sector. Returns null when the sector is
 * unknown/thin (no rolled-up rows), so callers degrade to the absolute scale.
 */
export async function getSectorBenchmarks(
  sector: string | null | undefined
): Promise<SectorBenchmarksResult | null> {
  const canonical = normalizeSector(sector);
  if (!canonical) return null;

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from('sector_metric_stats')
    .select('metric, p25, median, p75, sample_size')
    .eq('sector', canonical);

  if (error || !data || data.length === 0) return null;

  const benchmarks: SectorBenchmarks = {};
  for (const row of data as SectorMetricRow[]) {
    if (row.median == null || row.p25 == null || row.p75 == null) continue;
    benchmarks[row.metric as SectorMetricKey] = {
      p25: row.p25,
      median: row.median,
      p75: row.p75,
      sampleSize: row.sample_size,
    };
  }

  if (Object.keys(benchmarks).length === 0) return null;
  return { sector: canonical, benchmarks };
}
