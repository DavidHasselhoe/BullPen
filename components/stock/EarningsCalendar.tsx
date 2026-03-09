'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { Calendar as CalendarIcon, TrendingUp, TrendingDown, FileText } from 'lucide-react';
import type { EarningsCalendar as FinnhubEarnings } from '@/lib/finnhub/finnhub-client';

interface EarningsCalendarProps {
  ticker: string;
}

interface EarningsCalendarResponse {
  success: boolean;
  earnings?: FinnhubEarnings[];
  error?: string;
}

interface ReportedEarningsDate {
  date: string;
  periodEndDate?: string;
  source: 'SEC';
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function formatCurrency(value: number | null): string {
  if (value === null) return 'N/A';
  const absValue = Math.abs(value);
  if (absValue >= 1_000_000_000) {
    return `$${(value / 1_000_000_000).toFixed(0)}B`;
  } else if (absValue >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(0)}M`;
  } else if (absValue >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`;
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatHour(hour: string): string {
  if (!hour) return '';
  const lower = hour.toLowerCase();
  if (lower === 'amc' || lower === 'after-market-close') {
    return 'After Market Close';
  }
  if (lower === 'bmo' || lower === 'before-market-open') {
    return 'Before Market Open';
  }
  return hour;
}

function formatEPS(value: number | null): string {
  if (value === null) return 'N/A';
  return value.toFixed(2);
}

export function EarningsCalendar({ ticker }: EarningsCalendarProps) {
  // Finnhub: upcoming earnings
  const { data: upcomingData, isLoading: upcomingLoading, error: upcomingError } = useQuery({
    queryKey: ['earnings-calendar', ticker],
    queryFn: async (): Promise<FinnhubEarnings[]> => {
      try {
        const response = await fetch(`/api/stock/${ticker}/earnings-calendar`);
        if (!response.ok) return [];
        const result: EarningsCalendarResponse = await response.json();
        if (result.success && result.earnings) return result.earnings;
        return [];
      } catch {
        return [];
      }
    },
    enabled: !!ticker,
    staleTime: 1000 * 60 * 60 * 24,
  });

  // SEC 8-K Item 2.02: reported earnings dates (when company announced)
  const { data: reportedData } = useQuery({
    queryKey: ['earnings-dates', ticker],
    queryFn: async (): Promise<ReportedEarningsDate[]> => {
      try {
        const response = await fetch(`/api/stock/${ticker}/earnings-dates`);
        if (!response.ok) return [];
        const result = await response.json();
        if (result.success && result.earnings) return result.earnings;
        return [];
      } catch {
        return [];
      }
    },
    enabled: !!ticker,
    staleTime: 1000 * 60 * 60 * 24,
  });

  const upcoming = upcomingData && upcomingData.length > 0 ? upcomingData[0] : null;
  const reported = reportedData || [];
  const isLoading = upcomingLoading;
  const hasAnyData = upcoming || reported.length > 0;

  if (upcomingError) {
    return null;
  }

  if (isLoading && !hasAnyData) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Earnings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-6 w-full" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!hasAnyData) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            Earnings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No earnings data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5" />
          Earnings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Upcoming (from Finnhub) */}
        {upcoming && (
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
              Upcoming
            </h4>
            <div className="p-4 rounded-lg border border-border/50 bg-accent/30">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    {formatDate(upcoming.date)}
                  </span>
                  {upcoming.hour && (
                    <Badge variant="outline" className="text-xs">
                      {formatHour(upcoming.hour)}
                    </Badge>
                  )}
                </div>
                {upcoming.epsEstimate !== null && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">EPS Estimate</span>
                      <span className="font-semibold text-foreground">
                        ${formatEPS(upcoming.epsEstimate)}
                      </span>
                    </div>
                    {upcoming.epsActual !== null && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">EPS Actual</span>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">
                            ${formatEPS(upcoming.epsActual)}
                          </span>
                          {upcoming.epsActual >= (upcoming.epsEstimate || 0) ? (
                            <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
                          ) : (
                            <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                {upcoming.revenueEstimate !== null && (
                  <div className="pt-2 border-t border-border/50 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Revenue Estimate</span>
                      <span className="font-semibold text-foreground">
                        {formatCurrency(upcoming.revenueEstimate)}
                      </span>
                    </div>
                    {upcoming.revenueActual !== null && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Revenue Actual</span>
                        <span className="font-semibold text-foreground">
                          {formatCurrency(upcoming.revenueActual)}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Reported (from SEC 8-K Item 2.02) */}
        {reported.length > 0 && (
          <div>
            <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              Reported
              <Badge variant="secondary" className="text-[10px] font-normal">
                From SEC filings
              </Badge>
            </h4>
            <ul className="space-y-2">
              {reported.slice(0, 5).map((r, i) => (
                <li
                  key={`${r.date}-${i}`}
                  className="flex items-center justify-between text-sm py-1.5 px-3 rounded-md bg-muted/40"
                >
                  <span className="font-medium text-foreground">{formatDate(r.date)}</span>
                  {r.periodEndDate && (
                    <span className="text-xs text-muted-foreground">
                      Period ended {formatDate(r.periodEndDate)}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-muted-foreground mt-2">
              <FileText className="inline h-3 w-3 mr-1" />
              Dates from 8-K earnings announcements
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
