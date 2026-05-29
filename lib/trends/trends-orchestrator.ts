// Trends Orchestrator
// Coordinates trend detection from time-series financial metrics

import { createServerClient } from '../supabase/client';
import { getMetricsTimeSeries } from '../metrics/metrics-ui';
import {
  detectSustainedGrowthDecline,
  detectAccelerationDeceleration,
  detectVolatilityIncrease,
  detectDivergence,
} from './trend-detector';
import { upsertTrends, deleteCompanyTrends } from './trends-db';
import type { MetricType, PeriodType } from '../types/database';
import type { TrendResult } from './trend-detector';

export type TrendProgressCallback = (step: string, details?: unknown) => void;

export interface TrendAnalysisResult {
  success: boolean;
  companyId?: string;
  trendsCreated?: number;
  errors?: string[];
  details?: {
    companyName?: string;
    metricsAnalyzed?: number;
    trends?: Array<{
      metric_type: string;
      trend_type: string;
      direction: string;
      strength: number;
    }>;
  };
}

/**
 * Metrics to analyze for trends
 */
const METRICS_TO_ANALYZE: MetricType[] = [
  'revenue',
  'net_income',
  'operating_income',
  'eps_basic',
  'eps_diluted',
  'operating_cash_flow',
  'free_cash_flow',
];

/**
 * Related metric pairs for divergence detection
 */
const DIVERGENCE_PAIRS: Array<[MetricType, MetricType]> = [
  ['net_income', 'free_cash_flow'],
  ['operating_income', 'operating_cash_flow'],
  ['revenue', 'net_income'],
];

/**
 * Analyzes trends for a company's financial metrics
 * 
 * Process:
 * 1. Fetch company info
 * 2. Get time-series data for each metric (annual and quarterly)
 * 3. Run trend detection algorithms
 * 4. Store results in database
 */
export async function analyzeTrendsForCompany(
  companyId: string,
  options: {
    replaceExisting?: boolean;
    onProgress?: TrendProgressCallback;
  } = {}
): Promise<TrendAnalysisResult> {
  const { replaceExisting = true, onProgress } = options;
  const supabase = createServerClient();

  try {
    // Step 1: Fetch company info
    onProgress?.('Fetching company information');
    
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id, name, ticker')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return {
        success: false,
        errors: [`Failed to fetch company: ${companyError?.message || 'Not found'}`],
      };
    }

    onProgress?.('Company loaded', {
      companyName: company.name,
      ticker: company.ticker,
    });

    // Step 2: Delete existing trends if requested
    if (replaceExisting) {
      onProgress?.('Clearing existing trends');
      await deleteCompanyTrends(companyId);
    }

    // Step 3: Analyze trends for each metric
    const allTrends: TrendResult[] = [];
    const errors: string[] = [];

    for (const metricType of METRICS_TO_ANALYZE) {
      onProgress?.(`Analyzing ${metricType} trends`);

      // Analyze both annual and quarterly periods
      for (const periodType of ['annual', 'quarterly'] as PeriodType[]) {
        try {
          const timeSeries = await getMetricsTimeSeries(companyId, metricType, periodType);

          if (!timeSeries || timeSeries.data.length === 0) {
            continue; // Skip if no data
          }

          const dataPoints = timeSeries.data.map((d) => ({
            value: d.value,
            periodEndDate: d.periodEndDate,
          }));

          // Detect sustained growth/decline
          const sustainedTrend = detectSustainedGrowthDecline(
            companyId,
            metricType,
            periodType,
            dataPoints
          );
          if (sustainedTrend) {
            allTrends.push(sustainedTrend);
          }

          // Detect acceleration/deceleration
          const accelTrend = detectAccelerationDeceleration(
            companyId,
            metricType,
            periodType,
            dataPoints
          );
          if (accelTrend) {
            allTrends.push(accelTrend);
          }

          // Detect volatility increase
          const volTrend = detectVolatilityIncrease(
            companyId,
            metricType,
            periodType,
            dataPoints
          );
          if (volTrend) {
            allTrends.push(volTrend);
          }
        } catch (error) {
          errors.push(`Error analyzing ${metricType} (${periodType}): ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
    }

    // Step 4: Detect divergence between related metrics
    onProgress?.('Analyzing metric divergences');
    
    for (const [metric1, metric2] of DIVERGENCE_PAIRS) {
      try {
        // Try quarterly first, then annual
        for (const periodType of ['quarterly', 'annual'] as PeriodType[]) {
          const timeSeries1 = await getMetricsTimeSeries(companyId, metric1, periodType);
          const timeSeries2 = await getMetricsTimeSeries(companyId, metric2, periodType);

          if (!timeSeries1 || !timeSeries2 || timeSeries1.data.length === 0 || timeSeries2.data.length === 0) {
            continue;
          }

          const dataPoints1 = timeSeries1.data.map((d) => ({
            value: d.value,
            periodEndDate: d.periodEndDate,
          }));
          const dataPoints2 = timeSeries2.data.map((d) => ({
            value: d.value,
            periodEndDate: d.periodEndDate,
          }));

          const divergenceTrend = detectDivergence(
            companyId,
            metric1,
            metric2,
            periodType,
            dataPoints1,
            dataPoints2
          );

          if (divergenceTrend) {
            allTrends.push(divergenceTrend);
          }

          break; // Use first period type that has data for both metrics
        }
      } catch (error) {
        errors.push(`Error detecting divergence ${metric1}/${metric2}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Step 5: Store trends in database
    if (allTrends.length > 0) {
      onProgress?.(`Storing ${allTrends.length} trends`);
      const result = await upsertTrends(allTrends);

      if (!result.success) {
        errors.push(`Failed to store trends: ${result.error}`);
      }
    }

    return {
      success: errors.length === 0,
      companyId,
      trendsCreated: allTrends.length,
      errors: errors.length > 0 ? errors : undefined,
      details: {
        companyName: company.name,
        metricsAnalyzed: METRICS_TO_ANALYZE.length,
        trends: allTrends.map((t) => ({
          metric_type: t.metric_type,
          trend_type: t.trend_type,
          direction: t.direction,
          strength: t.strength,
        })),
      },
    };
  } catch (error) {
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown error'],
    };
  }
}
