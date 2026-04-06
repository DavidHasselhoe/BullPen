'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { Calendar as CalendarIcon, TrendingUp, TrendingDown } from 'lucide-react';
import type { EarningsCalendar as EarningsItem } from '@/lib/finnhub/finnhub-client';

interface EarningsCalendarResponse {
  success: boolean;
  earnings?: EarningsItem[];
  error?: string;
}

function formatDate(dateStr: string): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  }).format(new Date(dateStr + 'T12:00:00Z'));
}

function formatHour(hour: string): string {
  const h = hour.toLowerCase();
  if (h === 'pre market') return 'Pre Market';
  if (h === 'after hours') return 'After Hours';
  if (h === 'amc' || h === 'after-market-close') return 'After Hours';
  if (h === 'bmo' || h === 'before-market-open') return 'Pre Market';
  return '';
}

function EPSBar({ actual, estimate }: { actual: number | null; estimate: number | null }) {
  const beat = actual !== null && estimate !== null ? actual >= estimate : null;
  return (
    <div className="flex items-center gap-3 text-sm">
      {estimate !== null && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Est.</span>
          <span className="tabular-nums font-medium">${estimate.toFixed(2)}</span>
        </div>
      )}
      {actual !== null && (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">Act.</span>
          <span className={`tabular-nums font-semibold ${beat ? 'text-green-500' : 'text-red-500'}`}>
            ${actual.toFixed(2)}
          </span>
          {beat !== null && (
            beat
              ? <TrendingUp className="h-3.5 w-3.5 text-green-500" />
              : <TrendingDown className="h-3.5 w-3.5 text-red-500" />
          )}
        </div>
      )}
    </div>
  );
}

export function EarningsCalendar({ ticker }: { ticker: string }) {
  const today = new Date().toISOString().split('T')[0];

  const { data, isLoading } = useQuery<EarningsItem[]>({
    queryKey: ['earnings-calendar', ticker],
    queryFn: async () => {
      const from = new Date().toISOString().split('T')[0];
      const to = new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0];
      const res = await fetch(`/api/stock/${ticker}/earnings-calendar?from=${from}&to=${to}`);
      if (!res.ok) return [];
      const result: EarningsCalendarResponse = await res.json();
      return result.success && result.earnings ? result.earnings : [];
    },
    enabled: !!ticker,
    staleTime: 1000 * 60 * 60 * 6,
  });

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <CalendarIcon className="h-4 w-4" /> Earnings
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center justify-between">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-40" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data || data.length === 0) {
    return (
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <CalendarIcon className="h-4 w-4" /> Earnings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">No earnings data available</p>
        </CardContent>
      </Card>
    );
  }

  const upcoming = data.filter(e => e.date >= today);
  const past = data.filter(e => e.date < today);
  const nextEvent = upcoming[0] ?? null;

  return (
    <Card className="mb-8">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base font-semibold">
          <CalendarIcon className="h-4 w-4" /> Earnings
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-2 space-y-5">

        {/* Next earnings date */}
        {nextEvent && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Next Report</p>
            <div className="flex items-center justify-between rounded-lg border border-border/50 bg-accent/30 px-4 py-3">
              <div>
                <p className="font-semibold text-sm">{formatDate(nextEvent.date)}</p>
                {nextEvent.quarter && nextEvent.year && (
                  <p className="text-xs text-muted-foreground mt-0.5">Q{nextEvent.quarter} {nextEvent.year}</p>
                )}
              </div>
              <div className="flex items-center gap-2">
                {nextEvent.epsEstimate !== null && (
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">EPS Est.</p>
                    <p className="text-sm font-medium tabular-nums">${nextEvent.epsEstimate.toFixed(2)}</p>
                  </div>
                )}
                {formatHour(nextEvent.hour) && (
                  <Badge variant="outline" className="text-xs shrink-0">
                    {formatHour(nextEvent.hour)}
                  </Badge>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Past earnings */}
        {past.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">Recent Reports</p>
            <div className="space-y-1">
              {past.slice(0, 5).map((e, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2 px-3 rounded-md hover:bg-muted/40 transition-colors"
                >
                  <div>
                    <span className="text-sm font-medium">{formatDate(e.date)}</span>
                    {e.quarter && e.year && (
                      <span className="text-xs text-muted-foreground ml-2">Q{e.quarter} {e.year}</span>
                    )}
                  </div>
                  <EPSBar actual={e.epsActual} estimate={e.epsEstimate} />
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
