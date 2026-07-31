'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, ArrowLeft } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useBackground } from '@/hooks/use-background';
import { useHoldings } from '@/hooks/use-holdings';
import { useWatchlist } from '@/hooks/use-watchlist';
import { useAuth } from '@/hooks/use-auth';
import { getWeekRange, todayStr, fmtWeekRange, weekDatesBetween } from '@/lib/dates/calendar-format';
import { useCalendarWeek } from '@/components/tools/calendar/useCalendarWeek';
import { buildDayModel } from '@/components/tools/calendar/day-model';
import { YourWeekStrip } from '@/components/tools/calendar/YourWeekStrip';
import { TypeFilterChips } from '@/components/tools/calendar/TypeFilterChips';
import { CalendarGrid } from '@/components/tools/calendar/CalendarGrid';
import { DayDetailDialog } from '@/components/tools/calendar/DayDetailDialog';
import type { EventType } from '@/components/tools/calendar/types';

const WEEK_OFFSETS = [0, 1, 2, 3];
const WEEK_LABELS = ['This week', 'Next week', '+2w', '+3w'];
const ALL_TYPES: EventType[] = ['earnings', 'dividends', 'splits', 'ipo'];

export default function CalendarPage() {
  const { hasAnimatedBackground } = useBackground();
  const { isAuthenticated } = useAuth();
  const [weekOffset, setWeekOffset] = useState(0);
  const [typeFilter, setTypeFilter] = useState<Set<EventType>>(new Set(ALL_TYPES));
  const [openDate, setOpenDate] = useState<string | null>(null);

  const { from, to } = getWeekRange(weekOffset);
  const today = todayStr();
  const weekDates = useMemo(() => weekDatesBetween(from, to), [from, to]);

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
    () => buildDayModel(events, weekDates, mySymbols, typeFilter),
    [events, weekDates, mySymbols, typeFilter],
  );

  const openModel = days.find((d) => d.date === openDate) ?? null;

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

        {/* Week selector */}
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-1.5 flex-wrap">
            {WEEK_OFFSETS.map((offset) => (
              <button
                key={offset}
                onClick={() => setWeekOffset(offset)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-sm font-medium transition-all border',
                  weekOffset === offset
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20',
                )}
              >
                {WEEK_LABELS[offset]}
              </button>
            ))}
          </div>
          <span className="text-xs text-muted-foreground/85 tabular-nums font-mono">
            {fmtWeekRange(from, to)}
          </span>
        </div>

        {/* Type filters */}
        <div className="mb-6">
          <TypeFilterChips active={typeFilter} onToggle={toggleType} />
        </div>

        {/* Personalized highlight strip */}
        {isAuthenticated && <YourWeekStrip days={days} />}

        <Card>
          <CardContent className="pt-5 px-4 sm:px-5 pb-5">
            {isLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
                {weekDates.map((d) => (
                  <Skeleton key={d} className="min-h-[104px] rounded-lg" />
                ))}
              </div>
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
