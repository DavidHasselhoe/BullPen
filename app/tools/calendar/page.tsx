'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ArrowLeft, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useBackground } from '@/hooks/use-background';
import { useHoldings } from '@/hooks/use-holdings';
import { useWatchlist } from '@/hooks/use-watchlist';
import { useAuth } from '@/hooks/use-auth';
import {
  getWeekRange,
  todayStr,
  fmtWeekRange,
  fmtMonthLabel,
  weekDatesBetween,
  currentMonthKey,
  shiftMonth,
  monthRange,
} from '@/lib/dates/calendar-format';
import { useCalendarWeek } from '@/components/tools/calendar/useCalendarWeek';
import { buildDayModel } from '@/components/tools/calendar/day-model';
import { YourWeekStrip } from '@/components/tools/calendar/YourWeekStrip';
import { TypeFilterChips } from '@/components/tools/calendar/TypeFilterChips';
import { CalendarGrid } from '@/components/tools/calendar/CalendarGrid';
import { MonthCalendarGrid, MonthCalendarSkeleton } from '@/components/tools/calendar/MonthCalendarGrid';
import { DayDetailDialog } from '@/components/tools/calendar/DayDetailDialog';
import type { EventType } from '@/components/tools/calendar/types';

type ViewMode = 'week' | 'month';
/** Cell event limit — the month grid's rows are shorter than the week grid's. */
const MONTH_CELL_LIMIT = 2;
const ALL_TYPES: EventType[] = ['earnings', 'dividends', 'splits', 'ipo'];

export default function CalendarPage() {
  const { hasAnimatedBackground } = useBackground();
  const { isAuthenticated } = useAuth();
  const [mode, setMode] = useState<ViewMode>('week');
  // Independent of `mode` so paging with the chevrons (including into past
  // months, for looking up prior earnings) doesn't get reset by anything
  // else on the page — only switching back to week mode and back to month
  // mode via a pill touches it.
  const [monthKey, setMonthKey] = useState<string>(() => currentMonthKey());
  const [typeFilter, setTypeFilter] = useState<Set<EventType>>(new Set(ALL_TYPES));
  const [openDate, setOpenDate] = useState<string | null>(null);

  const today = todayStr();
  const thisMonthKey = currentMonthKey();

  const { from, to } = useMemo(() => {
    if (mode === 'week') {
      return getWeekRange(0);
    }
    const range = monthRange(monthKey);
    return { from: range.first, to: range.last };
  }, [mode, monthKey]);

  const rangeDates = useMemo(() => weekDatesBetween(from, to), [from, to]);

  const { events, isLoading } = useCalendarWeek(from, to);

  const { data: holdings } = useHoldings();
  const { data: watchlist } = useWatchlist();
  const mySymbols = useMemo(() => {
    const set = new Set<string>();
    for (const h of holdings ?? []) set.add(h.symbol.toUpperCase());
    for (const w of watchlist ?? []) set.add(w.symbol.toUpperCase());
    return set;
  }, [holdings, watchlist]);

  const days = useMemo(
    () => buildDayModel(events, rangeDates, mySymbols, typeFilter, mode === 'month' ? MONTH_CELL_LIMIT : undefined),
    [events, rangeDates, mySymbols, typeFilter, mode],
  );

  const openModel = days.find((d) => d.date === openDate) ?? null;

  // Confirmed earnings dates only land 3-6 weeks ahead of the report, so a
  // range with zero earnings in it is normal outside peak season, not broken
  // — say so explicitly rather than leaving every cell blank with no context.
  const earningsCount = useMemo(
    () => events.filter((e) => e.type === 'earnings').length,
    [events],
  );
  const showEarningsGap = !isLoading && typeFilter.has('earnings') && earningsCount === 0;

  function toggleType(type: EventType) {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      // Never let every chip turn off — that would silently blank the whole grid.
      return next.size === 0 ? new Set(ALL_TYPES) : next;
    });
  }

  return (
    <div className={cn('min-h-screen', hasAnimatedBackground ? '' : 'bg-background')}>
      <main className="container mx-auto max-w-5xl py-10 px-4 sm:px-6 lg:px-8">

        {/* Header */}
        <div className="mb-8">
          <Link
            href="/tools"
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-5 group"
          >
            <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
            All tools
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 shrink-0">
              <CalendarDays className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Market Calendar</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Earnings, dividends, splits & IPOs</p>
            </div>
          </div>
        </div>

        {/* Timeframe selector */}
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Timeframe">
            <button
              onClick={() => setMode('week')}
              aria-pressed={mode === 'week'}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-all border',
                mode === 'week'
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20',
              )}
            >
              This week
            </button>
            <button
              onClick={() => { setMode('month'); setMonthKey(thisMonthKey); }}
              aria-pressed={mode === 'month' && monthKey === thisMonthKey}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-all border',
                mode === 'month' && monthKey === thisMonthKey
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20',
              )}
            >
              This month
            </button>
            <button
              onClick={() => { setMode('month'); setMonthKey(shiftMonth(thisMonthKey, 1)); }}
              aria-pressed={mode === 'month' && monthKey === shiftMonth(thisMonthKey, 1)}
              className={cn(
                'rounded-lg px-3 py-1.5 text-sm font-medium transition-all border',
                mode === 'month' && monthKey === shiftMonth(thisMonthKey, 1)
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20',
              )}
            >
              Next month
            </button>
          </div>

          {mode === 'month' ? (
            <div className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setMonthKey((k) => shiftMonth(k, -1))}
                disabled={isLoading}
                aria-label={`Previous month, ${fmtMonthLabel(shiftMonth(monthKey, -1))}`}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground/85 tabular-nums font-mono min-w-[92px] text-center">
                {fmtMonthLabel(monthKey)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => setMonthKey((k) => shiftMonth(k, 1))}
                disabled={isLoading}
                aria-label={`Next month, ${fmtMonthLabel(shiftMonth(monthKey, 1))}`}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground/85 tabular-nums font-mono">
              {fmtWeekRange(from, to)}
            </span>
          )}
        </div>

        {/* Type filters */}
        <div className="mb-6">
          <TypeFilterChips active={typeFilter} onToggle={toggleType} />
        </div>

        {/* Quiet-earnings-season context — a blank grid with no explanation
            reads as broken, not "nothing confirmed yet". */}
        {showEarningsGap && (
          <div className="mb-6 flex items-start gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" aria-hidden />
            <p>
              No confirmed earnings dates in this range yet. Companies usually confirm their report date 3 to 6 weeks ahead, so this fills in automatically as new dates are announced.
            </p>
          </div>
        )}

        {/* Personalized highlight strip */}
        {isAuthenticated && <YourWeekStrip days={days} />}

        <Card>
          <CardContent className="pt-5 px-4 sm:px-5 pb-5">
            {isLoading ? (
              mode === 'month' ? (
                <MonthCalendarSkeleton monthKey={monthKey} />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
                  {rangeDates.map((d) => (
                    <Skeleton key={d} className="min-h-[104px] rounded-lg" />
                  ))}
                </div>
              )
            ) : mode === 'month' ? (
              <MonthCalendarGrid
                monthKey={monthKey}
                days={days}
                today={today}
                mySymbols={mySymbols}
                onOpenDay={setOpenDate}
              />
            ) : (
              <CalendarGrid days={days} today={today} mySymbols={mySymbols} onOpenDay={setOpenDate} />
            )}
          </CardContent>
        </Card>

        <DayDetailDialog model={openModel} onOpenChange={(open) => { if (!open) setOpenDate(null); }} />

      </main>
    </div>
  );
}
