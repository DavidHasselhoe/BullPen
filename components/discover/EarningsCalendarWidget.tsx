'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { CalendarDays, Clock, TrendingUp, TrendingDown } from 'lucide-react';
import { useHoldings } from '@/hooks/use-holdings';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useAuth } from '@/hooks/use-auth';
import { cn } from '@/lib/utils';
import type { EarningsCalendarItem, EarningsCalendar } from '@/lib/twelvedata/twelvedata-client';

// ── Normalised row (single shape used by both sources) ──────────────────────

interface EarningsRow {
  symbol: string;
  name?: string;
  date: string;
  time?: string;
  epsEstimate: number | null;
  epsActual: number | null;
  fiscalQuarter?: string;
}

function fromCalendarItem(item: EarningsCalendarItem): EarningsRow {
  return {
    symbol: item.symbol,
    name: item.name,
    date: item.date,
    time: item.time,
    epsEstimate: item.eps_estimate ?? null,
    epsActual: item.eps_actual ?? null,
    fiscalQuarter: item.fiscal_quarter,
  };
}

function fromHoldingEarning(e: EarningsCalendar): EarningsRow {
  return {
    symbol: e.symbol,
    date: e.date,
    time: e.hour,
    epsEstimate: e.epsEstimate,
    epsActual: e.epsActual,
    fiscalQuarter: e.quarter ? `Q${e.quarter} ${e.year ?? ''}`.trim() : undefined,
  };
}

// ── Date helpers ────────────────────────────────────────────────────────────

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

function fmtEps(v: number | null): string {
  if (v === null || v === undefined) return '—';
  return `$${v.toFixed(2)}`;
}

// ── Single row ──────────────────────────────────────────────────────────────

function EarningsRowItem({ row }: { row: EarningsRow }) {
  const today = todayStr();
  const isToday = row.date === today;
  const isPast = row.date < today;
  const hasActual = row.epsActual !== null && row.epsActual !== undefined;
  const beat =
    hasActual && row.epsEstimate !== null && row.epsEstimate !== undefined
      ? row.epsActual! >= row.epsEstimate
      : null;

  const timeLabel =
    row.time === 'BMO' || row.time === 'pre_market'
      ? 'Pre-mkt'
      : row.time === 'AMC' || row.time === 'after_close'
      ? 'After-hrs'
      : null;

  return (
    <Link
      href={`/stock/${row.symbol}`}
      className="group grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1fr)_68px_68px_72px] items-center gap-x-4 gap-y-0 rounded-lg px-3 py-2.5 -mx-3 hover:bg-accent/50 transition-colors"
    >
      {/* Company */}
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">
            {row.symbol}
          </span>
          {row.name && (
            <span className="text-xs text-muted-foreground truncate hidden sm:block max-w-[180px]">
              {row.name}
            </span>
          )}
          {isToday && (
            <Badge className="text-[10px] px-1.5 py-0 h-4 bg-primary/10 text-primary border-primary/20 border font-semibold">
              Today
            </Badge>
          )}
        </div>
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
      </div>

      {/* Est. EPS */}
      <div className="hidden sm:block text-right">
        <p className="text-[10px] text-muted-foreground mb-0.5">Est.</p>
        <p className="text-sm tabular-nums font-medium">{fmtEps(row.epsEstimate)}</p>
      </div>

      {/* Actual EPS */}
      <div className="hidden sm:block text-right">
        {hasActual ? (
          <>
            <p className="text-[10px] text-muted-foreground mb-0.5">Act.</p>
            <p className={cn('text-sm tabular-nums font-semibold', beat ? 'text-emerald-500' : 'text-red-500')}>
              {fmtEps(row.epsActual)}
            </p>
          </>
        ) : isPast ? (
          <span className="text-xs text-muted-foreground/40">n/a</span>
        ) : null}
      </div>

      {/* Beat / miss / date */}
      <div className="text-right shrink-0">
        {hasActual && beat !== null ? (
          <span className={cn('inline-flex items-center gap-0.5 text-xs font-semibold', beat ? 'text-emerald-500' : 'text-red-500')}>
            {beat ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {beat ? 'Beat' : 'Miss'}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground tabular-nums">{fmtDateLabel(row.date)}</span>
        )}
      </div>
    </Link>
  );
}

// ── Skeleton placeholder ────────────────────────────────────────────────────

function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-0.5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-3 py-3">
          <div className="space-y-1.5">
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3 w-28" />
          </div>
          <div className="flex gap-6 items-center">
            <Skeleton className="h-3.5 w-10 hidden sm:block" />
            <Skeleton className="h-3.5 w-10 hidden sm:block" />
            <Skeleton className="h-3.5 w-14" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main widget ─────────────────────────────────────────────────────────────

export function EarningsCalendarWidget() {
  const { isAuthenticated } = useAuth();
  const { marketContextMode } = useUserSettings();
  const isPortfolioMode = marketContextMode === 'holdings';
  const { data: holdings, isLoading: holdingsLoading } = useHoldings();

  const today = todayStr();
  const windowEnd = addDays(today, 14);

  // ── All-markets mode: global earnings calendar, next 14 days ────────────
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

  // ── Portfolio mode: per-holding earnings via earnings-calendar endpoint ──
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

  // ── Resolve loading state ─────────────────────────────────────────────────
  const isLoading = isPortfolioMode
    ? holdingsLoading || holdingsEarLoading
    : calLoading;

  // ── Build display rows ───────────────────────────────────────────────────
  const rows: EarningsRow[] = useMemo(() => {
    if (isPortfolioMode) {
      return holdingsEarnings ?? [];
    }
    return (calData?.data ?? []).slice(0, 12).map(fromCalendarItem);
  }, [isPortfolioMode, calData, holdingsEarnings]);

  // Hide portfolio widget when not logged in or no holdings yet
  if (isPortfolioMode && !isAuthenticated) return null;
  if (isPortfolioMode && !holdingsLoading && holdingSymbols.length === 0) return null;

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            {isPortfolioMode ? 'Portfolio Earnings' : 'Upcoming Earnings'}
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
            : 'Reports scheduled in the next 2 weeks.'}
        </p>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Column headers */}
        <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,1fr)_68px_68px_72px] gap-x-4 pb-2 border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wide px-3 -mx-3">
          <span>Company</span>
          <span className="hidden sm:block text-right">Est.</span>
          <span className="hidden sm:block text-right">Act.</span>
          <span className="text-right">Date</span>
        </div>

        <div className="mt-1">
          {isLoading ? (
            <SkeletonRows />
          ) : rows.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {isPortfolioMode
                ? 'No recent or upcoming earnings for your holdings.'
                : 'No earnings scheduled in the next 2 weeks.'}
            </div>
          ) : (
            <div>
              {rows.map((row, i) => (
                <EarningsRowItem key={`${row.symbol}-${row.date}-${i}`} row={row} />
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
