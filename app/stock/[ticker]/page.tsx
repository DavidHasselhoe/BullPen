'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCompany, useMetricsTimeSeries } from '@/hooks/use-metrics';
import { useStockStatus } from '@/hooks/use-stock-status';
import { MetricSelector } from '@/components/metrics/MetricSelector';
import { PeriodToggle } from '@/components/metrics/PeriodToggle';
import { DeltaCards } from '@/components/metrics/DeltaCards';
import { TrendIndicator } from '@/components/metrics/TrendIndicator';
import { CompositeScoreCard } from '@/components/metrics/CompositeScoreCard';
import { IngestionProgressBar } from '@/components/stock/IngestionProgressBar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, Building2, Loader2 } from 'lucide-react';
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
  const queryClient = useQueryClient();
  const ticker = (params.ticker as string)?.toUpperCase() || '';
  const [selectedMetric, setSelectedMetric] = useState<MetricType>('revenue');
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('annual');
  const [hasTriggeredIngestion, setHasTriggeredIngestion] = useState(false);
  const [showProgressBar, setShowProgressBar] = useState(false);

  // Check ingestion status (polls every 3s if data is missing)
  const { data: stockStatus, isLoading: statusLoading } = useStockStatus(ticker, !!ticker);

  // Trigger ingestion if company doesn't exist or has no data
  const ingestionMutation = useMutation({
    mutationFn: async (ticker: string) => {
      const response = await fetch('/api/ingest/lazy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticker }),
      });
      const data = await response.json();
      if (!data.success) {
        throw new Error(data.error || 'Ingestion failed');
      }
      return data;
    },
  });

  // Trigger ingestion once when page loads if needed
  // The IngestionProgressBar component handles ingestion via SSE endpoint
  // We just need to show it when ingestion is needed
  useEffect(() => {
    if (
      !hasTriggeredIngestion &&
      stockStatus &&
      (!stockStatus.companyExists || !stockStatus.hasAnyData)
    ) {
      setHasTriggeredIngestion(true);
      setShowProgressBar(true);
      // Note: Ingestion is triggered by the IngestionProgressBar component
      // which connects to /api/ingest/lazy/progress - that endpoint handles ingestion internally
    }
  }, [ticker, stockStatus, hasTriggeredIngestion]);

  // Auto-refresh queries when status changes
  useEffect(() => {
    if (!stockStatus) return;

    // If company just became available, invalidate and refetch company queries
    if (stockStatus.companyExists) {
      queryClient.invalidateQueries({ queryKey: ['company-info', ticker] });
      queryClient.invalidateQueries({ queryKey: ['company', ticker] });
    }

    // If data just became available, invalidate and refetch metrics
    if (stockStatus.hasAnyData && stockStatus.metricsCount > 0) {
      queryClient.invalidateQueries({ queryKey: ['metrics'] });
      queryClient.invalidateQueries({ queryKey: ['stock-status', ticker] });
    }
  }, [stockStatus, queryClient, ticker]);

  // Handle progress completion - refresh all data
  const handleProgressComplete = () => {
    setShowProgressBar(false);
    // Invalidate all related queries to force refresh
    queryClient.invalidateQueries({ queryKey: ['stock-status', ticker] });
    queryClient.invalidateQueries({ queryKey: ['company-info', ticker] });
    queryClient.invalidateQueries({ queryKey: ['company', ticker] });
    queryClient.invalidateQueries({ queryKey: ['metrics'] });
    
    // Small delay then refetch
    setTimeout(() => {
      refetchCompany();
      if (companyId) {
        refetchCompanyId();
        refetchMetrics();
      }
    }, 500);
  };

  // Fetch full company info (refetch when status changes)
  const { data: company, isLoading: companyInfoLoading, error: companyInfoError, refetch: refetchCompany } = useQuery({
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
    staleTime: 1000, // Allow quick refetching
  });

  // Refetch company when status shows it exists
  useEffect(() => {
    if (stockStatus?.companyExists && !company) {
      refetchCompany();
    }
  }, [stockStatus?.companyExists, company, refetchCompany]);

  // TanStack Query hooks for metrics (only enabled when company exists)
  const { 
    data: companyId, 
    isLoading: companyLoading, 
    error: companyError,
    refetch: refetchCompanyId 
  } = useCompany(ticker);
  
  const {
    data: timeSeries,
    isLoading: metricsLoading,
    error: metricsError,
    refetch: refetchMetrics,
  } = useMetricsTimeSeries(companyId || null, selectedMetric, selectedPeriod);

  // Refetch metrics when status updates (as data becomes available)
  useEffect(() => {
    if (stockStatus?.hasAnyData && companyId && !timeSeries) {
      // Data is available, refetch metrics
      refetchMetrics();
    }
  }, [stockStatus?.hasAnyData, companyId, timeSeries, refetchMetrics]);

  // Refetch company ID when company becomes available
  useEffect(() => {
    if (stockStatus?.companyExists && !companyId) {
      refetchCompanyId();
    }
  }, [stockStatus?.companyExists, companyId, refetchCompanyId]);

  // Calculate deltas from time-series data
  const qoqDelta = timeSeries && timeSeries.periodType === 'quarterly'
    ? calculateQoQChange(timeSeries.data)
    : null;
  const yoyDelta = timeSeries ? calculateYoYChange(timeSeries.data, timeSeries.periodType) : null;

  const isLoading = companyInfoLoading || companyLoading || metricsLoading;
  
  // Don't show error if ingestion is in progress (metrics aren't expected yet)
  // Check if we're still waiting for data - either progress bar is showing or status indicates no data yet
  const isIngesting = showProgressBar || (stockStatus && !stockStatus.hasAnyData);
  
  // Suppress metrics errors during ingestion - they're expected
  let error = companyInfoError || companyError;
  if (!isIngesting && metricsError) {
    error = metricsError;
  }

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

        {/* Show detailed progress bar if ingestion is in progress */}
        {showProgressBar && (
          <IngestionProgressBar
            ticker={ticker}
            onComplete={handleProgressComplete}
            onError={(error) => {
              console.error('Ingestion error:', error);
              setShowProgressBar(false);
            }}
          />
        )}

        {/* Company Not Found / Loading - Show Status if no progress bar */}
        {!companyInfoLoading && !company && !error && !showProgressBar && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Analyzing {ticker}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Fetching and processing SEC filings. Data will appear as it becomes available.
              </p>
              
              {stockStatus && (
                <div className="space-y-3">
                  {/* Progress indicators for each data type */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Company profile</span>
                      {stockStatus.companyExists ? (
                        <Badge variant="outline" className="text-xs bg-green-500/10 text-green-700 dark:text-green-400">
                          Ready
                        </Badge>
                      ) : (
                        <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                      )}
                    </div>
                    
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Filings processed</span>
                      <span className="font-medium">{stockStatus.filingsCount} filing{stockStatus.filingsCount !== 1 ? 's' : ''}</span>
                    </div>
                    
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Financial metrics</span>
                      <span className="font-medium">{stockStatus.metricsCount} metric{stockStatus.metricsCount !== 1 ? 's' : ''}</span>
                    </div>
                    
                    {stockStatus.filingsCount > 0 && (
                      <div className="mt-2">
                        <Progress 
                          value={Math.min((stockStatus.metricsCount / (stockStatus.filingsCount * 7)) * 100, 100)} 
                          className="h-1.5" 
                        />
                      </div>
                    )}
                  </div>
                </div>
              )}
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

            {/* No Metrics Data State - Show Progressive Loading */}
            {!isLoading && !error && !timeSeries && companyId && (
              <Card>
                <CardContent className="pt-6">
                  <div className="space-y-3">
                    <p className="text-center text-sm text-muted-foreground">
                      {stockStatus && stockStatus.filingsCount > 0 
                        ? `Processing ${stockStatus.filingsCount} filing${stockStatus.filingsCount !== 1 ? 's' : ''}... Metrics will appear as they're extracted.`
                        : 'Waiting for filings to be processed. Metrics will appear shortly.'
                      }
                    </p>
                    {stockStatus && stockStatus.filingsCount > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <span>Processing filings</span>
                          <span>{stockStatus.metricsCount} metrics extracted</span>
                        </div>
                        <Progress 
                          value={stockStatus.filingsCount > 0 
                            ? Math.min((stockStatus.metricsCount / (stockStatus.filingsCount * 7)) * 100, 95)
                            : 0
                          } 
                          className="h-2" 
                        />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
