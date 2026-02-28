'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useCompany, useMetricsTimeSeries } from '@/hooks/use-metrics';
import { MetricSelector } from '@/components/metrics/MetricSelector';
import { PeriodToggle } from '@/components/metrics/PeriodToggle';
import { Input } from '@/components/ui/input';
import { DeltaCards } from '@/components/metrics/DeltaCards';
import { TrendIndicator } from '@/components/metrics/TrendIndicator';
import { CompositeScoreCard } from '@/components/metrics/CompositeScoreCard';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { MetricType, PeriodType } from '@/lib/types/database';
import type { DeltaCard } from '@/lib/metrics/metrics-ui';
import { useBackground } from '@/hooks/use-background';

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

const DEFAULT_TICKER = 'NVDA'; // Default to NVDA - has ingested EPS data from pipeline

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

export default function MetricsPage() {
  const [ticker, setTicker] = useState(DEFAULT_TICKER);
  const { hasAnimatedBackground } = useBackground();
  // Default to EPS (Diluted) + Quarterly - matches what our pipeline extracts from 10-Qs
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('eps_diluted');
  const getDefaultPeriod = (metric: MetricType): PeriodType => {
    if (metric === 'eps_basic' || metric === 'eps_diluted') {
      return 'quarterly';
    }
    return 'annual';
  };
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('quarterly');
  
  // Auto-switch to quarterly when EPS is selected
  const handleMetricChange = (metric: MetricType) => {
    setSelectedMetric(metric);
    if (metric === 'eps_basic' || metric === 'eps_diluted') {
      setSelectedPeriod('quarterly');
    }
  };

  // TanStack Query hooks
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

  const isLoading = companyLoading || metricsLoading;
  const error = companyError || metricsError;

  return (
    <div className={`min-h-screen ${hasAnimatedBackground ? '' : 'bg-background'}`}>
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold text-foreground">
            Financial Metrics
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            View time-series financial data extracted from SEC filings
          </p>
          <div className="mt-4 flex items-center gap-2">
            <label className="text-sm text-muted-foreground whitespace-nowrap">Ticker:</label>
            <Input
              value={ticker}
              onChange={(e) => setTicker(e.target.value.toUpperCase())}
              placeholder="e.g. NVDA, AAPL"
              className="w-32"
            />
          </div>
        </div>

        {/* Controls */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <MetricSelector selected={selectedMetric} onChange={handleMetricChange} />
          <PeriodToggle selected={selectedPeriod} onChange={setSelectedPeriod} />
        </div>

        {/* Error State */}
        {error && (
          <Card className="border-destructive/50 bg-destructive/10">
            <CardContent className="pt-6">
              <p className="text-sm text-destructive">
                {error instanceof Error ? error.message : 'An error occurred'}
              </p>
            </CardContent>
          </Card>
        )}

        {/* Loading State */}
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

        {/* Content */}
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

        {/* No Data State */}
        {!isLoading && !error && !timeSeries && (
          <Card>
            <CardContent className="pt-6">
              <p className="text-center text-sm text-muted-foreground">
                No metrics found for the selected filters.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
