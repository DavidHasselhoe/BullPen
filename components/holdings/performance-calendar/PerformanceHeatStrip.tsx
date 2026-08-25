'use client';

import { useMemo } from 'react';
import { Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { fmtWeekRange, monthKeyOf, todayET, weekRangeOf } from '@/lib/dates/calendar-format';
import { summarize } from '@/lib/holdings/daily-performance';
import type { CurrencyCode } from '@/lib/currency/currency-conversion';
import { useDailyPerformance } from './use-daily-performance';
import { CalendarGrid } from './CalendarGrid';
import { buildWeekRow, fmtSignedCurrency, fmtSignedPercent, textClass } from './calendar-model';

interface Props {
  currency?: CurrencyCode;
  fxRate?: number;
  onExpand: () => void;
}

/**
 * Always-visible, ~100px preview: a summary line for the current Mon-Sun
 * week plus that week laid out as one row of the same DayCell/CalendarGrid
 * used by the full month view — real weekday labels, day numbers, tint and
 * contributor popovers, not an anonymous strip of dots. The full interactive
 * calendar (month navigation, other weeks) lives behind "Expand" in a dialog
 * — this view exists so the page never pays the full grid's multi-row height
 * just to show the current week.
 *
 * The current week can straddle two calendar months (e.g. Mon Aug 31 - Sun
 * Sep 6). useDailyPerformance only fetches one month at a time, so both are
 * requested and merged; the second query is skipped entirely (`enabled`)
 * when the week doesn't cross a boundary, which is true almost every week.
 */
export function PerformanceHeatStrip({ currency = 'USD', fxRate = 1, onExpand }: Props) {
  const today = todayET();
  const { from: weekFrom, to: weekTo } = useMemo(() => weekRangeOf(today), [today]);
  const monthA = monthKeyOf(weekFrom);
  const monthB = monthKeyOf(weekTo);
  const crossesMonth = monthA !== monthB;

  const resultA = useDailyPerformance(monthA);
  const resultB = useDailyPerformance(monthB, crossesMonth);

  const isLoading = resultA.isLoading || (crossesMonth && resultB.isLoading);
  const isGated = resultA.isGated || resultB.isGated;

  const weekRow = useMemo(() => {
    const days = crossesMonth ? [...resultA.days, ...resultB.days] : resultA.days;
    const holidays = crossesMonth ? [...resultA.holidays, ...resultB.holidays] : resultA.holidays;
    return buildWeekRow(weekFrom, weekTo, days, holidays);
  }, [weekFrom, weekTo, crossesMonth, resultA.days, resultA.holidays, resultB.days, resultB.holidays]);
  const weekData = useMemo(() => weekRow.flatMap((c) => (c.data ? [c.data] : [])), [weekRow]);
  const total = summarize(weekData);
  const hasData = weekData.length > 0;

  return (
    <div className="min-w-0">
      <div className="flex items-start justify-between gap-3 mb-3">
        {isLoading ? (
          <Skeleton className="h-6 w-40" />
        ) : hasData ? (
          <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1 min-w-0">
            <span className={cn('font-mono tabular-nums text-lg font-semibold', textClass(total.pct))}>
              {fmtSignedPercent(total.pct)}
            </span>
            <span className="font-mono tabular-nums text-sm text-muted-foreground">
              {fmtSignedCurrency(total.pnlUsd * fxRate, currency)}
            </span>
            <span className="text-xs text-muted-foreground/70">
              {total.upDays} up · {total.downDays} down
            </span>
            <span className="text-xs text-muted-foreground/60">{fmtWeekRange(weekFrom, weekTo)}</span>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {isGated
              ? 'Daily performance is briefly unavailable.'
              : `No positions were held so far this week (${fmtWeekRange(weekFrom, weekTo)}).`}
          </span>
        )}

        <Button variant="outline" size="sm" onClick={onExpand} className="shrink-0 text-xs">
          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          Expand
        </Button>
      </div>

      {isLoading ? (
        // 5 columns — matches CalendarGrid's default (Mon-Fri) shape; the
        // brief flash before data lands isn't worth knowing showWeekend for.
        <div className="grid grid-cols-5 gap-1 sm:gap-1.5" aria-hidden="true">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-[48px] sm:h-[64px] rounded-lg" />
          ))}
        </div>
      ) : hasData ? (
        <CalendarGrid weeks={[weekRow]} fxRate={fxRate} currency={currency} compact />
      ) : null}
    </div>
  );
}
