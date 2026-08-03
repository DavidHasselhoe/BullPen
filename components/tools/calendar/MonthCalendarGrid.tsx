'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { monthWeeks, WEEKDAY_LABELS } from '@/lib/dates/calendar-format';
import { DayCell } from './DayCell';
import type { DayModel } from './types';

interface MonthCalendarGridProps {
  monthKey: string;
  days: DayModel[];
  today: string;
  mySymbols: Set<string>;
  onOpenDay: (date: string) => void;
}

const EMPTY_DAY = (date: string): DayModel => ({
  date, mine: [], others: [], shown: [], moreCount: 0, total: 0,
});

/**
 * Real Monday-first month grid — weeks stacked, leading/trailing pad cells so
 * weekday columns line up like a traditional calendar. Cells render `compact`
 * (day number, not "Mon, Aug 3"; fewer events) since a month spans 5-6 rows
 * where the single-week grid only ever spans one.
 */
export function MonthCalendarGrid({ monthKey, days, today, mySymbols, onOpenDay }: MonthCalendarGridProps) {
  const byDate = new Map(days.map((d) => [d.date, d]));
  const weeks = monthWeeks(monthKey);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="hidden sm:grid grid-cols-7 gap-1.5 mb-0.5" role="row">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            role="columnheader"
            className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground/60 text-center"
          >
            {label}
          </div>
        ))}
      </div>

      <div className="flex flex-col gap-1.5" role="grid" aria-label="Month calendar">
        {weeks.map((week, i) => (
          <div key={i} className="grid grid-cols-1 sm:grid-cols-7 gap-1.5" role="row">
            {week.map((date, j) =>
              date === null ? (
                <div key={`pad-${i}-${j}`} className="hidden sm:block" aria-hidden="true" />
              ) : (
                <DayCell
                  key={date}
                  model={byDate.get(date) ?? EMPTY_DAY(date)}
                  today={today}
                  mySymbols={mySymbols}
                  onOpenDay={onOpenDay}
                  compact
                />
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Skeleton mirroring the real month's week count so the block doesn't
 *  resize when data lands. */
export function MonthCalendarSkeleton({ monthKey }: { monthKey: string }) {
  const weeks = monthWeeks(monthKey);
  return (
    <div className="flex flex-col gap-1.5" aria-hidden="true">
      {weeks.map((week, i) => (
        <div key={i} className="grid grid-cols-1 sm:grid-cols-7 gap-1.5">
          {week.map((date, j) => (
            <Skeleton
              key={j}
              className={cn('rounded-lg min-h-[64px] sm:min-h-[76px]', date === null && 'hidden sm:block')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
