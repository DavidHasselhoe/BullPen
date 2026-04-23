'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Clock } from 'lucide-react';
import { useHoldings } from '@/hooks/use-holdings';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useAuth } from '@/hooks/use-auth';
import type { EarningsCalendarItem, EarningsCalendar } from '@/lib/twelvedata/twelvedata-client';

// ── Normalised row ───────────────────────────────────────────────────────────

interface EarningsRow {
  symbol: string;
  name?: string;
  date: string;
  time?: string;
  fiscalQuarter?: string;
}

function fromCalendarItem(item: EarningsCalendarItem): EarningsRow {
  return {
    symbol: item.symbol,
    name: item.name,
    date: item.date,
    time: item.time,
    fiscalQuarter: item.fiscal_quarter,
  };
}

function fromHoldingEarning(e: EarningsCalendar): EarningsRow {
  return {
    symbol: e.symbol,
    date: e.date,
    time: e.hour,
    fiscalQuarter: e.quarter ? `Q${e.quarter} ${e.year ?? ''}`.trim() : undefined,
  };
}

// ── Date helpers ─────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(base: string, n: number): string {
  const d = new Date(base + 'T12:00:00Z');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function fmtDateLabel(dateStr: string): string {
  const today = todayStr();
  const tomorrow = addDays(today, 1);
  if (dateStr === today) return 'Today';
  if (dateStr === tomorrow) return 'Tomorrow';
  const d = new Date(dateStr + 'T12:00:00Z');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── Single row ───────────────────────────────────────────────────────────────

function EarningsRowItem({ row }: { row: EarningsRow }) {
  const today = todayStr();
  const isToday = row.date === today;

  const timeLabel =
    row.time === 'BMO' || row.time === 'pre_market'
      ? 'Pre-mkt'
      : row.time === 'AMC' || row.time === 'after_close'
      ? 'After-hrs'
      : null;

  return (
    <Link
      href={`/stock/${row.symbol}`}
      className="group flex items-center justify-between gap-3 rounded-lg px-3 py-2 -mx-3 hover:bg-accent/50 transition-colors"
    >
      {/* Left: company info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
            {row.symbol}
          </span>
          {isToday && (
            <Badge className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20 border font-semibold">
              Today
            </Badge>
          )}
          {row.name && (
            <span className="text-xs text-muted-foreground truncate hidden sm:block max-w-[160px]">
              {row.name}
            </span>
          )}
        </div>
        {(row.fiscalQuarter || timeLabel) && (
          <div className="flex items-center gap-2 mt-0.5">
            {row.fiscalQuarter && (
              <span className="text-[11px] text-muted-foreground/60">{row.fiscalQuarter}</span>
            )}
            {timeLabel && (
              <span className="text-[11px] text-muted-foreground/50 flex items-center gap-0.5">
                <Clock className="h-2.5 w-2.5" />
                {timeLabel}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right: date */}
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {fmtDateLabel(row.date)}
      </span>
    </Link>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────────────────

function SkeletonRows({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-3 py-2.5">
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-14" />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

export function EarningsCalendarWidget() {
  const { isAuthenticated } = useAuth();
  const { marketContextMode } = useUserSettings();
  const isPortfolioMode = marketContextMode === 'holdings';
  const { data: holdings, isLoading: holdingsLoading } = useHoldings();

  const today = todayStr();
  const windowEnd = addDays(today, 7);

  // ── All-markets mode: next 7 days, filtered to S&P 500 + Nasdaq 100 ───────
  const { data: calData, isLoading: calLoading } = useQuery<{
    success: boolean;
    data?: EarningsCalendarItem[];
  }>({
    queryKey: ['earnings-calendar-widget', today, windowEnd],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/earnings?from=${today}&to=${windowEnd}`);
      return res.json();
    },
    enabled: !isPortfolioMode,
    staleTime: 60 * 60 * 1000,
  });

  // ── Portfolio mode: per-holding earnings ─────────────────────────────────
  const holdingSymbols = useMemo(
    () => (isPortfolioMode && holdings ? holdings.map((h) => h.symbol) : []),
    [isPortfolioMode, holdings]
  );

  const { data: holdingsEarnings, isLoading: holdingsEarLoading } = useQuery<EarningsRow[]>({
    queryKey: ['earnings-widget-holdings', holdingSymbols.join(',')],
    queryFn: async () => {
      if (!holdingSymbols.length) return [];
      const cutoff = addDays(today, -60);

      const results = await Promise.allSettled(
        holdingSymbols.map((sym) =>
          fetch(`/api/stock/${sym}/earnings-calendar`).then((r) => r.json())
        )
      );

      const rows: EarningsRow[] = [];
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value?.success && Array.isArray(r.value.earnings)) {
          (r.value.earnings as EarningsCalendar[])
            .filter((e) => e.date >= cutoff)
            .forEach((e) => rows.push(fromHoldingEarning(e)));
        }
      });

      return rows.sort((a, b) => a.date.localeCompare(b.date));
    },
    enabled: isPortfolioMode && holdingSymbols.length > 0,
    staleTime: 30 * 60 * 1000,
  });

  const isLoading = isPortfolioMode
    ? holdingsLoading || holdingsEarLoading
    : calLoading;

  const MAX_ROWS = 12;

  const allRows: EarningsRow[] = useMemo(() => {
    if (isPortfolioMode) return holdingsEarnings ?? [];
    return (calData?.data ?? []).map(fromCalendarItem);
  }, [isPortfolioMode, calData, holdingsEarnings]);

  const rows = allRows.slice(0, MAX_ROWS);
  const hiddenCount = Math.max(0, allRows.length - MAX_ROWS);

  if (isPortfolioMode && !isAuthenticated) return null;
  if (isPortfolioMode && !holdingsLoading && holdingSymbols.length === 0) return null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {isPortfolioMode ? 'Portfolio Earnings' : 'Earnings This Week'}
          </CardTitle>
          <Link
            href="/tools/calendar"
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            Full calendar →
          </Link>
        </div>
        <p className="text-xs text-muted-foreground">
          {isPortfolioMode
            ? 'Earnings reports for companies you hold.'
            : 'Major companies reporting in the next 7 days.'}
        </p>
      </CardHeader>

      <CardContent className="pt-0">
        {isLoading ? (
          <SkeletonRows />
        ) : rows.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            {isPortfolioMode
              ? 'No recent or upcoming earnings for your holdings.'
              : 'No major earnings scheduled this week.'}
          </div>
        ) : (
          <div>
            {rows.map((row, i) => (
              <EarningsRowItem key={`${row.symbol}-${row.date}-${i}`} row={row} />
            ))}
            {hiddenCount > 0 && (
              <Link
                href="/tools/calendar"
                className="block text-center text-xs text-muted-foreground hover:text-primary transition-colors pt-2 mt-1 border-t border-border/50"
              >
                +{hiddenCount} more · View full calendar →
              </Link>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
