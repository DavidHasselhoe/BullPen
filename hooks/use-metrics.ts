import { useQuery } from '@tanstack/react-query';
import type { MetricType, PeriodType, Trend } from '@/lib/types/database';
import type { MetricTimeSeries } from '@/lib/metrics/metrics-ui';

interface CompanyResponse {
  success: boolean;
  companyId?: string;
  error?: string;
}

interface TimeSeriesResponse {
  success: boolean;
  timeSeries?: MetricTimeSeries;
  error?: string;
}

/**
 * TanStack Query hook to fetch company ID by ticker
 */
export function useCompany(ticker: string) {
  return useQuery({
    queryKey: ['company', ticker],
    queryFn: async (): Promise<string | null> => {
      const response = await fetch(`/api/metrics/company?ticker=${ticker}`);
      const data: CompanyResponse = await response.json();

      if (data.success && data.companyId) {
        return data.companyId;
      }
      throw new Error(data.error || 'Company not found');
    },
    enabled: !!ticker,
    staleTime: 5 * 60 * 1000, // 5 minutes - company ID doesn't change often
  });
}

/**
 * TanStack Query hook to fetch time-series metrics
 */
export function useMetricsTimeSeries(
  companyId: string | null,
  metricType: MetricType,
  periodType: PeriodType
) {
  return useQuery({
    queryKey: ['metrics', companyId, metricType, periodType],
    queryFn: async (): Promise<MetricTimeSeries> => {
      if (!companyId) {
        throw new Error('Company ID is required');
      }

      const response = await fetch(
        `/api/metrics/time-series?companyId=${companyId}&metricType=${metricType}&periodType=${periodType}`
      );
      const data: TimeSeriesResponse = await response.json();

      if (data.success && data.timeSeries) {
        return data.timeSeries;
      }
      throw new Error(data.error || 'No metrics found');
    },
    enabled: !!companyId,
    staleTime: 60 * 1000, // 1 minute - metrics update when new filings are ingested
  });
}

interface TrendResponse {
  success: boolean;
  trend?: Trend | null;
  error?: string;
}

/**
 * TanStack Query hook to fetch the strongest trend for a metric and period
 */
export function useTrend(
  companyId: string | null,
  metricType: MetricType,
  periodType: PeriodType
) {
  return useQuery({
    queryKey: ['trend', companyId, metricType, periodType],
    queryFn: async (): Promise<Trend | null> => {
      if (!companyId) {
        return null;
      }

      const response = await fetch(
        `/api/metrics/trends?companyId=${companyId}&metricType=${metricType}&periodType=${periodType}`
      );
      const data: TrendResponse = await response.json();

      if (data.success && data.trend) {
        return data.trend;
      }
      return null;
    },
    enabled: !!companyId,
    staleTime: 5 * 60 * 1000, // 5 minutes - trends don't change as frequently
  });
}
