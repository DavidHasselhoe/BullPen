'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useQuery } from '@tanstack/react-query';
import { useCompany, useMetricsTimeSeries } from '@/hooks/use-metrics';
import { MetricSelector } from '@/components/metrics/MetricSelector';
import { PeriodToggle } from '@/components/metrics/PeriodToggle';
import { DeltaCards } from '@/components/metrics/DeltaCards';
import { TrendIndicator } from '@/components/metrics/TrendIndicator';
import { CompositeScoreCard } from '@/components/metrics/CompositeScoreCard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, Building2 } from 'lucide-react';
import type { MetricType, PeriodType, Company } from '@/lib/types/database';
import type { DeltaCard } from '@/lib/metrics/metrics-ui';

// Dynamically import chart to avoid SSR issues with Recharts
const MetricsChart = dynamic(
  () => import('@/components/metrics/MetricsChart').then((mod) => ({ default: mod.MetricsChart })),
  {
    ssr: false,
    loading: () => (
      <Card>
        <CardContent className="pt-6">
          <div className="flex h-64 items-center justify-center">
            <Skeleton className="h-full w-full" />
          </div>
        </CardContent>
      </Card>
    ),
  }
);

interface CompanyResponse {
  success: boolean;
  company?: Company;
  error?: string;
}

// Client-side deterministic delta calculations
function calculateQoQChange(data: Array<{ value: number; unit: string; periodEndDate: string }>): DeltaCard | null {
  if (data.length < 2) return null;
  const current = data[data.length - 1];
  const previous = data[data.length - 2];
  if (!current || !previous) return null;

  const change = current.value - previous.value;
  const percentage = previous.value !== 0 ? ((change / previous.value) * 100) : 0;

  return {
    label: 'QoQ Change',
    value: change,
    valueFormatted: formatDeltaValue(change, current.unit),
    percentage: Math.abs(percentage),
    isPositive: change >= 0,
  };
}

function calculateYoYChange(
  data: Array<{ value: number; unit: string; periodEndDate: string }>,
  periodType: PeriodType
): DeltaCard | null {
  if (data.length < 2) return null;

  let current = data[data.length - 1];
  let previous: typeof current | undefined = undefined;

  if (periodType === 'annual') {
    previous = data[data.length - 2];
  } else {
    const currentDate = new Date(current.periodEndDate);
    const targetYear = currentDate.getFullYear() - 1;
    previous = data.find(d => {
      const dDate = new Date(d.periodEndDate);
      return dDate.getFullYear() === targetYear &&
        Math.abs(dDate.getMonth() - currentDate.getMonth()) <= 1;
    });
  }

  if (!current || !previous) return null;

  const change = current.value - previous.value;
  const percentage = previous.value !== 0 ? ((change / previous.value) * 100) : 0;

  return {
    label: periodType === 'annual' ? 'YoY Change' : 'YoY Change (Same Quarter)',
    value: change,
    valueFormatted: formatDeltaValue(change, current.unit),
    percentage: Math.abs(percentage),
    isPositive: change >= 0,
  };
}

function formatDeltaValue(value: number, unit: string): string {
  if (unit.includes('shares')) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;
  }

  const absValue = Math.abs(value);
  if (absValue >= 1_000_000_000) {
    return `${value >= 0 ? '+' : ''}${(value / 1_000_000_000).toFixed(2)}B`;
  } else if (absValue >= 1_000_000) {
    return `${value >= 0 ? '+' : ''}${(value / 1_000_000).toFixed(2)}M`;
  }
  return `${value >= 0 ? '+' : ''}${value.toLocaleString()}`;
}

export default function StockDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticker = (params.ticker as string)?.toUpperCase() || '';
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('revenue');
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('annual');

  // Fetch full company info
  const { data: company, isLoading: companyInfoLoading, error: companyInfoError } = useQuery({
    queryKey: ['company-info', ticker],
    queryFn: async (): Promise<Company | null> => {
      const response = await fetch(`/api/stock/${ticker}`);
      const data: CompanyResponse = await response.json();

      if (data.success && data.company) {
        return data.company;
      }
      return null;
    },
    enabled: !!ticker,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // TanStack Query hooks for metrics
  const { data: companyId, isLoading: companyLoading, error: companyError } = useCompany(ticker);
  const {
    data: timeSeries,
    isLoading: metricsLoading,
    error: metricsError,
  } = useMetricsTimeSeries(companyId || null, selectedMetric, selectedPeriod);

  // Calculate deltas from time-series data
  const qoqDelta = timeSeries && timeSeries.periodType === 'quarterly'
    ? calculateQoQChange(timeSeries.data)
    : null;
  const yoyDelta = timeSeries ? calculateYoYChange(timeSeries.data, timeSeries.periodType) : null;

  const isLoading = companyInfoLoading || companyLoading || metricsLoading;
  const error = companyInfoError || companyError || metricsError;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="mb-6 flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        {/* Company Header */}
        {company && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                      <Building2 className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <h1 className="text-3xl font-semibold text-foreground">
                        {company.name}
                      </h1>
                      <div className="mt-1 flex items-center gap-2">
                        <Badge variant="outline" className="font-mono text-sm">
                          {company.ticker}
                        </Badge>
                        {company.sector && (
                          <span className="text-sm text-muted-foreground">
                            {company.sector}
                            {company.industry && ` • ${company.industry}`}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardHeader>
            {company.description && (
              <CardContent>
                <Separator className="mb-4" />
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {company.description}
                </p>
              </CardContent>
            )}
          </Card>
        )}

        {/* Loading State for Company Info */}
        {companyInfoLoading && !company && (
          <Card className="mb-8">
            <CardHeader>
              <Skeleton className="h-8 w-64" />
              <Skeleton className="mt-2 h-4 w-48" />
            </CardHeader>
          </Card>
        )}

        {/* Error State */}
        {error && (
          <Card className="mb-6 border-destructive/50 bg-destructive/10">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">
                {error instanceof Error ? error.message : 'An error occurred'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Company Not Found */}
        {!companyInfoLoading && !company && !error && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <p className="text-center text-sm text-muted-foreground">
                Company {ticker} not found. Data may still be ingesting.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Metrics Section */}
        {company && (
          <>
            <div className="mb-6">
              <h2 className="text-2xl font-semibold text-foreground">Financial Metrics</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Time-series financial data extracted from SEC filings
              </p>
            </div>

            {/* Controls */}
            <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <MetricSelector selected={selectedMetric} onChange={setSelectedMetric} />
              <PeriodToggle selected={selectedPeriod} onChange={setSelectedPeriod} />
            </div>

            {/* Loading State for Metrics */}
            {isLoading && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Card>
                    <CardContent className="pt-6">
                      <Skeleton className="h-24 w-full" />
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-6">
                      <Skeleton className="h-24 w-full" />
                    </CardContent>
                  </Card>
                </div>
                <Card>
                  <CardContent className="pt-6">
                    <Skeleton className="h-96 w-full" />
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Metrics Content */}
            {!isLoading && !error && timeSeries && (
              <div className="space-y-6">
                {/* Delta Cards */}
                <DeltaCards qoq={qoqDelta} yoy={yoyDelta} />

                {/* Trend Indicator - Contextual insight for selected metric/period */}
                {companyId && (
                  <TrendIndicator
                    companyId={companyId}
                    metricType={selectedMetric}
                    periodType={selectedPeriod}
                  />
                )}

                {/* Chart */}
                <MetricsChart timeSeries={timeSeries} />

                {/* Composite Score */}
                {companyId && <CompositeScoreCard companyId={companyId} />}
              </div>
            )}

            {/* No Metrics Data State */}
            {!isLoading && !error && !timeSeries && companyId && (
              <Card>
                <CardContent className="pt-6">
                  <p className="text-center text-sm text-muted-foreground">
                    No metrics found for {company.name}. Data may still be processing.
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
