'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useHoldings } from '@/hooks/use-holdings';
import { useUserSettings } from '@/hooks/use-user-settings';
import { useAuth } from '@/hooks/use-auth';
import type { EarningsCalendarItem, EarningsCalendar } from '@/lib/twelvedata/twelvedata-client';
import { slugToAssetPath } from '@/lib/assets/asset-type';

// ── Types ─────────────────────────────────────────────────────────────────────

interface EarningsRow {
  symbol: string;
  name?: string;
  date: string;
  time?: string;
}

function fromCalendarItem(item: EarningsCalendarItem): EarningsRow {
  return { symbol: item.symbol, name: item.name, date: item.date, time: item.time };
}

function fromHoldingEarning(e: EarningsCalendar): EarningsRow {
  return { symbol: e.symbol, date: e.date, time: e.hour };
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Mon–Fri dates of the ISO week containing `today`. */
function getWeekDates(today: string): string[] {
  const [y, m, d] = today.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const dow = date.getUTCDay(); // 0=Sun
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - daysSinceMonday);
  return Array.from({ length: 5 }, (_, i) => {
    const day = new Date(monday);
    day.setUTCDate(monday.getUTCDate() + i);
    return day.toISOString().slice(0, 10);
  });
}

function fmtWeekRange(weekDates: string[]): string {
  const first = new Date(weekDates[0] + 'T12:00:00Z');
  const last = new Date(weekDates[4] + 'T12:00:00Z');
  const mo1 = first.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  const mo2 = last.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }).toUpperCase();
  const d1 = first.getUTCDate();
  const d2 = last.getUTCDate();
  return mo1 === mo2 ? `${mo1} ${d1} — ${d2}` : `${mo1} ${d1} — ${mo2} ${d2}`;
}

type TimeTag = 'BMO' | 'AMC' | null;

function timeTag(time?: string): TimeTag {
  if (time === 'BMO' || time === 'pre_market') return 'BMO';
  if (time === 'AMC' || time === 'after_close') return 'AMC';
  return null;
}

const DAY_NAMES = ['MON', 'TUE', 'WED', 'THU', 'FRI'];
const MAX_PER_DAY = 5;

// ── Day column ────────────────────────────────────────────────────────────────

function timeOrder(time?: string): number {
  if (time === 'BMO' || time === 'pre_market') return 0;
  if (time === 'AMC' || time === 'after_close') return 2;
  return 1;
}

function DayColumn({
  dateStr,
  dayLabel,
  isToday,
  rows,
}: {
  dateStr: string;
  dayLabel: string;
  isToday: boolean;
  rows: EarningsRow[];
}) {
  const sorted = [...rows].sort((a, b) => timeOrder(a.time) - timeOrder(b.time));
  const visible = sorted.slice(0, MAX_PER_DAY);
  const overflow = rows.length - visible.length;
  const dayNum = parseInt(dateStr.slice(8), 10);

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border min-w-0 transition-colors overflow-hidden',
        isToday
          ? 'border-border/60'
          : 'border-border/40 bg-card/50'
      )}
    >
      {/* Today accent bar */}
      {isToday && <div className="h-0.5 w-full bg-primary shrink-0" />}

      <div className="p-3 flex flex-col flex-1">
        {/* Day header */}
        <div className="mb-3 select-none">
          <p className={cn(
            'text-[10px] font-bold uppercase tracking-[0.12em]',
            isToday ? 'text-primary' : 'text-muted-foreground/80'
          )}>
            {dayLabel}
          </p>
          <p className={cn(
            'text-[26px] font-black leading-none mt-0.5 tabular-nums',
            isToday ? 'text-primary' : 'text-foreground/80'
          )}>
            {dayNum}
          </p>
        </div>

        {/* Earnings list */}
        <div className="space-y-1.5 flex-1">
          {visible.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/80 pt-0.5 select-none">—</p>
          ) : (
            visible.map((row, i) => {
              const tag = timeTag(row.time);
              return (
                <Link
                  key={`${row.symbol}-${i}`}
                  href={slugToAssetPath(row.symbol)}
                  className="group flex items-center justify-between gap-1 rounded-md bg-muted/40 px-2.5 py-[7px] hover:bg-accent/60 transition-colors"
                >
                  <span className="text-[11px] font-bold text-foreground group-hover:text-primary transition-colors truncate leading-none">
                    {row.symbol}
                  </span>
                  {tag && (
                    <span className={cn(
                      'text-[8px] font-bold px-1 py-0.5 rounded uppercase tracking-wide shrink-0 leading-none',
                      tag === 'BMO'
                        ? 'bg-sky-500/10 text-sky-500/70'
                        : 'bg-amber-500/10 text-amber-500/70'
                    )}>
                      {tag}
                    </span>
                  )}
                </Link>
              );
            })
          )}
        </div>

        {/* Overflow link */}
        {overflow > 0 && (
          <Link
            href="/tools/calendar"
            className="mt-2 text-[10px] text-muted-foreground/80 hover:text-primary transition-colors"
          >
            +{overflow} more
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Skeleton ──────────────────────────────────────────────────────────────────

function SkeletonCalendar() {
  return (
    <div className="grid grid-cols-5 gap-2 min-w-[520px]">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border/40 bg-card/50 p-3 space-y-3">
          <div className="space-y-1.5">
            <Skeleton className="h-2.5 w-7" />
            <Skeleton className="h-7 w-8" />
          </div>
          {Array.from({ length: i === 1 ? 3 : i === 3 ? 4 : 2 }).map((_, j) => (
            <Skeleton key={j} className="h-[30px] w-full rounded-md" />
          ))}
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
  const weekDates = useMemo(() => getWeekDates(today), [today]);
  const weekStart = weekDates[0];
  const weekEnd = weekDates[4];

  // ── All-markets: single batch request for the week ────────────────────────
  const { data: calData, isLoading: calLoading } = useQuery<{
    success: boolean;
    data?: EarningsCalendarItem[];
  }>({
    queryKey: ['earnings-calendar-widget', weekStart, weekEnd],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/earnings?from=${weekStart}&to=${weekEnd}`);
      return res.json();
    },
    enabled: !isPortfolioMode,
    staleTime: 60 * 60 * 1000,
  });

  // ── Portfolio mode: per-holding earnings filtered to this week ────────────
  const holdingSymbols = useMemo(
    () => (isPortfolioMode && holdings ? holdings.map((h) => h.symbol) : []),
    [isPortfolioMode, holdings]
  );

  const { data: holdingsEarnings, isLoading: holdingsEarLoading } = useQuery<EarningsRow[]>({
    queryKey: ['earnings-widget-holdings', holdingSymbols.join(','), weekStart, weekEnd],
    queryFn: async () => {
      if (!holdingSymbols.length) return [];
      const results = await Promise.allSettled(
        holdingSymbols.map((sym) =>
          fetch(`/api/stock/${sym}/earnings-calendar`).then((r) => r.json())
        )
      );
      const rows: EarningsRow[] = [];
      results.forEach((r) => {
        if (r.status === 'fulfilled' && r.value?.success && Array.isArray(r.value.earnings)) {
          (r.value.earnings as EarningsCalendar[])
            .filter((e) => e.date >= weekStart && e.date <= weekEnd)
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

  // Group all rows by date
  const rowsByDate = useMemo(() => {
    const allRows: EarningsRow[] = isPortfolioMode
      ? (holdingsEarnings ?? [])
      : (calData?.data ?? []).map(fromCalendarItem);
    const map = new Map<string, EarningsRow[]>();
    for (const row of allRows) {
      const bucket = map.get(row.date) ?? [];
      bucket.push(row);
      map.set(row.date, bucket);
    }
    return map;
  }, [isPortfolioMode, calData, holdingsEarnings]);

  if (isPortfolioMode && !isAuthenticated) return null;
  if (isPortfolioMode && !holdingsLoading && holdingSymbols.length === 0) return null;

  return (
    <div className="space-y-4 min-w-0">
      {/* Editorial section header */}
      <div className="flex items-center gap-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/85 shrink-0">
          {isPortfolioMode ? 'Portfolio earnings' : 'Earnings this week'}
        </span>
        <div className="flex-1 h-px bg-border/50" />
        <span className="text-[10px] font-mono text-muted-foreground/80 hidden sm:block tracking-wider shrink-0">
          {fmtWeekRange(weekDates)}
        </span>
        <Link
          href="/tools/calendar"
          className="text-[10px] font-mono text-muted-foreground/85 hover:text-foreground transition-colors uppercase tracking-wider shrink-0"
        >
          Full →
        </Link>
      </div>

      {/* Calendar grid — horizontally scrollable on mobile */}
      <div className="overflow-x-auto -mx-1 px-1 pb-1">
        {isLoading ? (
          <SkeletonCalendar />
        ) : (
          <div className="grid grid-cols-5 gap-2 min-w-[520px]">
            {weekDates.map((dateStr, i) => (
              <DayColumn
                key={dateStr}
                dateStr={dateStr}
                dayLabel={DAY_NAMES[i]}
                isToday={dateStr === today}
                rows={rowsByDate.get(dateStr) ?? []}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
