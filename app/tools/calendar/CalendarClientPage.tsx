'use client';

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarDays, ArrowLeft, Info, Loader2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useBackground } from '@/hooks/use-background';
import { useHoldings } from '@/hooks/use-holdings';
import { useWatchlist } from '@/hooks/use-watchlist';
import { useAuth } from '@/hooks/use-auth';
import {
  todayET,
  addDays,
  weekRangeOf,
  fmtWeekRange,
  fmtMonthLabel,
  fmtShortDate,
  weekDatesBetween,
  monthKeyOf,
  monthRange,
  shiftMonth,
  isValidMonthKey,
} from '@/lib/dates/calendar-format';
import { useCalendarEvents } from '@/components/tools/calendar/useCalendarEvents';
import { buildDayModel } from '@/components/tools/calendar/day-model';
import { YourWeekStrip } from '@/components/tools/calendar/YourWeekStrip';
import { TypeFilterChips } from '@/components/tools/calendar/TypeFilterChips';
import { CalendarGrid } from '@/components/tools/calendar/CalendarGrid';
import { MonthCalendarGrid, MonthCalendarSkeleton } from '@/components/tools/calendar/MonthCalendarGrid';
import { ListCalendar } from '@/components/tools/calendar/ListCalendar';
import { DayDetailDialog } from '@/components/tools/calendar/DayDetailDialog';
import { CalendarViewToggle, CalendarDateNav, type CalendarView } from '@/components/tools/calendar/CalendarControls';
import type { EventType } from '@/components/tools/calendar/types';

/** Cell event limits — month rows are shorter than week rows. */
const MONTH_CELL_LIMIT = 6;
const WEEK_CELL_LIMIT = 3;
const ALL_TYPES: EventType[] = ['earnings', 'dividends', 'splits', 'ipo'];
/** Days covered by the rolling agenda in list view. */
const LIST_SPAN_DAYS = 13;

const VALID_VIEWS = new Set<CalendarView>(['list', 'week', 'month']);
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function CalendarClientPage() {
  const { t } = useTranslation('tools');
  const router = useRouter();
  const searchParams = useSearchParams();
  const { hasAnimatedBackground } = useBackground();
  const { isAuthenticated } = useAuth();

  const today = todayET();

  // View + anchor live in the URL so a specific week is shareable, browser
  // back/forward pages through dates, and a reload keeps its place.
  const rawView = searchParams.get('view') as CalendarView | null;
  const view: CalendarView = rawView && VALID_VIEWS.has(rawView) ? rawView : 'week';
  const rawDate = searchParams.get('date');
  const anchor = rawDate && DATE_RE.test(rawDate) && !Number.isNaN(Date.parse(`${rawDate}T12:00:00Z`))
    ? rawDate
    : today;

  const [typeFilter, setTypeFilter] = useState<Set<EventType>>(new Set(ALL_TYPES));
  const [openDate, setOpenDate] = useState<string | null>(null);

  const setParams = useCallback(
    (next: { view?: CalendarView; date?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('view', next.view ?? view);
      params.set('date', next.date ?? anchor);
      router.replace(`/tools/calendar?${params.toString()}`, { scroll: false });
    },
    [router, searchParams, view, anchor],
  );

  // ── Range for the active view ──────────────────────────────────────────────
  const { from, to } = useMemo(() => {
    if (view === 'month') {
      const key = isValidMonthKey(monthKeyOf(anchor)) ? monthKeyOf(anchor) : monthKeyOf(today);
      const r = monthRange(key);
      return { from: r.first, to: r.last };
    }
    if (view === 'list') {
      return { from: anchor, to: addDays(anchor, LIST_SPAN_DAYS) };
    }
    return weekRangeOf(anchor);
  }, [view, anchor, today]);

  const rangeDates = useMemo(() => weekDatesBetween(from, to), [from, to]);
  const { events, dayTotals, isLoading, isPartial } = useCalendarEvents(from, to);

  const { data: holdings } = useHoldings();
  const { data: watchlist } = useWatchlist();
  const mySymbols = useMemo(() => {
    const set = new Set<string>();
    for (const h of holdings ?? []) set.add(h.symbol.toUpperCase());
    for (const w of watchlist ?? []) set.add(w.symbol.toUpperCase());
    return set;
  }, [holdings, watchlist]);

  const cellLimit = view === 'month' ? MONTH_CELL_LIMIT : WEEK_CELL_LIMIT;
  const days = useMemo(
    () => buildDayModel(events, rangeDates, mySymbols, typeFilter, cellLimit, dayTotals),
    [events, rangeDates, mySymbols, typeFilter, cellLimit, dayTotals],
  );

  const openModel = days.find((d) => d.date === openDate) ?? null;

  // ── Navigation ─────────────────────────────────────────────────────────────
  const step = view === 'list' ? LIST_SPAN_DAYS + 1 : 7;
  const goPrev = () =>
    setParams({ date: view === 'month' ? `${shiftMonth(monthKeyOf(anchor), -1)}-01` : addDays(anchor, -step) });
  const goNext = () =>
    setParams({ date: view === 'month' ? `${shiftMonth(monthKeyOf(anchor), 1)}-01` : addDays(anchor, step) });

  const periodLabel =
    view === 'month' ? fmtMonthLabel(monthKeyOf(anchor))
    : view === 'week' ? fmtWeekRange(from, to)
    : t('calendarDateRange', '{{from}} to {{to}}', { from: fmtShortDate(from), to: fmtShortDate(to) });

  // "Today" only appears once the anchor has left the current period, so it
  // isn't a permanently-lit control that does nothing.
  const showToday = view === 'month'
    ? monthKeyOf(anchor) !== monthKeyOf(today)
    : !(today >= from && today <= to);

  // ── Empty-state context ────────────────────────────────────────────────────
  const earningsCount = useMemo(() => events.filter((e) => e.type === 'earnings').length, [events]);
  // Gated on !isPartial so a range still filling in never claims to be empty.
  const showEarningsGap = !isLoading && !isPartial && typeFilter.has('earnings') && earningsCount === 0;
  const hasAnyEvents = days.some((d) => d.total > 0);

  function toggleType(type: EventType) {
    setTypeFilter((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type); else next.add(type);
      // Never let every chip turn off — that would silently blank the grid.
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
            className="group mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
            {t('allToolsLink', 'All tools')}
          </Link>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <CalendarDays className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t('calendarTitle', 'Market Calendar')}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">{t('calendarSubtitle', 'Earnings, dividends, splits & IPOs')}</p>
            </div>
          </div>
        </div>

        {/* View + date navigation */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <CalendarViewToggle view={view} onChange={(v) => setParams({ view: v })} />
          <CalendarDateNav
            label={periodLabel}
            prevLabel={
              view === 'month'
                ? t('calendarPreviousMonth', 'Previous month')
                : view === 'week'
                ? t('calendarPreviousWeek', 'Previous week')
                : t('calendarPreviousPeriod', 'Previous period')
            }
            nextLabel={
              view === 'month'
                ? t('calendarNextMonth', 'Next month')
                : view === 'week'
                ? t('calendarNextWeek', 'Next week')
                : t('calendarNextPeriod', 'Next period')
            }
            onPrev={goPrev}
            onNext={goNext}
            onToday={() => setParams({ date: today })}
            showToday={showToday}
          />
        </div>

        {/* Type filters */}
        <div className="mb-6">
          <TypeFilterChips active={typeFilter} onToggle={toggleType} />
        </div>

        {/* Still filling days outside the pre-warmed window. */}
        {isPartial && (
          <div className="mb-6 flex items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin motion-reduce:animate-none" aria-hidden />
            <p>{t('calendarLoadingRange', 'Loading the rest of this range. Days will fill in as they arrive.')}</p>
          </div>
        )}

        {/* Quiet-earnings-season context — a blank grid with no explanation
            reads as broken, not "nothing confirmed yet". */}
        {showEarningsGap && (
          <div className="mb-6 flex items-start gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-2.5 text-xs text-muted-foreground">
            <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <p>
              {t(
                'calendarEarningsGap',
                'No confirmed earnings dates in this range yet. Companies usually confirm their report date 3 to 6 weeks ahead, so this fills in automatically as new dates are announced.'
              )}
            </p>
          </div>
        )}

        {isAuthenticated && <YourWeekStrip days={days} />}

        <Card>
          <CardContent className="px-4 pb-5 pt-5 sm:px-5">
            {isLoading ? (
              view === 'month' ? (
                <MonthCalendarSkeleton monthKey={monthKeyOf(anchor)} />
              ) : view === 'week' ? (
                <>
                  <div className="hidden grid-cols-7 gap-2 sm:grid">
                    {rangeDates.map((d) => <Skeleton key={d} className="min-h-[136px] rounded-lg" />)}
                  </div>
                  <div className="flex flex-col gap-2 sm:hidden">
                    {rangeDates.slice(0, 4).map((d) => <Skeleton key={d} className="h-16 rounded-lg" />)}
                  </div>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  {rangeDates.slice(0, 6).map((d) => <Skeleton key={d} className="h-14 rounded-lg" />)}
                </div>
              )
            ) : view === 'month' ? (
              <MonthCalendarGrid
                monthKey={monthKeyOf(anchor)}
                days={days}
                today={today}
                mySymbols={mySymbols}
                onOpenDay={setOpenDate}
              />
            ) : view === 'week' ? (
              <>
                {/* A 7-column grid at 375px gives ~41px per column, too narrow
                    for a logo and a ticker, so phones get the same week as a
                    list rather than a squeezed grid or a 7-item stack. */}
                <div className="hidden sm:block">
                  <CalendarGrid days={days} today={today} mySymbols={mySymbols} onOpenDay={setOpenDate} />
                </div>
                <div className="sm:hidden">
                  {hasAnyEvents
                    ? <ListCalendar days={days} today={today} mySymbols={mySymbols} onOpenDay={setOpenDate} />
                    : <EmptyRange />}
                </div>
              </>
            ) : (
              hasAnyEvents
                ? <ListCalendar days={days} today={today} mySymbols={mySymbols} onOpenDay={setOpenDate} />
                : <EmptyRange />
            )}
          </CardContent>
        </Card>

        <DayDetailDialog model={openModel} onOpenChange={(open) => { if (!open) setOpenDate(null); }} />
      </main>
    </div>
  );
}

function EmptyRange() {
  const { t } = useTranslation('tools');
  return (
    <p className="py-10 text-center text-sm text-muted-foreground">
      {t('calendarNothingScheduled', 'Nothing scheduled in this range.')}
    </p>
  );
}
