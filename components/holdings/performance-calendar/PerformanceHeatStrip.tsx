'use client';

import { Maximize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { currentMonthKey, fmtMonthLabelShort, fmtFullDate } from '@/lib/dates/calendar-format';
import { summarize } from '@/lib/holdings/daily-performance';
import type { CurrencyCode } from '@/lib/currency/currency-conversion';
import { useDailyPerformance } from './use-daily-performance';
import { fmtSignedCurrency, fmtSignedPercent, textClass, stripFillClass } from './calendar-model';

interface Props {
  currency?: CurrencyCode;
  fxRate?: number;
  onExpand: () => void;
}

const SKELETON_SQUARES = 22;

/**
 * Always-visible, ~90px preview of this month's daily performance: a summary
 * line plus a sparkline-style strip of small squares, one per trading day so
 * far this month, coloured the same way the full grid's cells are. The full
 * interactive calendar (month navigation, per-day contributors) lives behind
 * "Expand" in a dialog — this view exists so the page never pays the full
 * grid's ~500px+ height just to show today's number.
 *
 * Deliberately not `aria-hidden`-decorative: the strip itself is a button
 * with an aria-label summarising the month, matching "Expand" — a screen
 * reader user gets the same "open the full calendar" affordance either way,
 * without 20+ individually-focusable squares that duplicate the dialog's
 * own fully-accessible grid.
 */
export function PerformanceHeatStrip({ currency = 'USD', fxRate = 1, onExpand }: Props) {
  const month = currentMonthKey();
  const { days, isLoading, isGated } = useDailyPerformance(month);
  const total = summarize(days);
  const hasData = days.length > 0;

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
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {isGated
              ? 'Daily performance is briefly unavailable.'
              : `No positions were held so far in ${fmtMonthLabelShort(month)}.`}
          </span>
        )}

        <Button variant="outline" size="sm" onClick={onExpand} className="shrink-0 text-xs">
          <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
          Expand
        </Button>
      </div>

      {isLoading ? (
        <div className="flex flex-wrap gap-1" aria-hidden="true">
          {Array.from({ length: SKELETON_SQUARES }).map((_, i) => (
            <Skeleton key={i} className="h-3.5 w-3.5 rounded-sm shrink-0" />
          ))}
        </div>
      ) : hasData ? (
        <button
          type="button"
          onClick={onExpand}
          aria-label={`${days.length} trading days in ${fmtMonthLabelShort(month)}. Expand for the full calendar.`}
          className="flex flex-wrap gap-1 rounded-lg -m-1 p-1 transition-colors duration-150 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {days.map((day) => (
            <span
              key={day.date}
              title={`${fmtFullDate(day.date)}: ${fmtSignedPercent(day.pct)}`}
              className={cn('h-3.5 w-3.5 rounded-sm shrink-0', stripFillClass(day.pct))}
            />
          ))}
        </button>
      ) : null}
    </div>
  );
}
