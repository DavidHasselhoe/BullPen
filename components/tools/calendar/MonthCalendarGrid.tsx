'use client';

import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { monthWeeks } from '@/lib/dates/calendar-format';
import { DayCell } from './DayCell';
import { WeekdayHeader } from './CalendarGrid';
import { useGridKeyboardNav } from './useGridKeyboardNav';
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
  typeCounts: { earnings: 0, dividends: 0, splits: 0, ipo: 0 },
});

/**
 * Monday-first month grid — weeks stacked, leading/trailing pad cells so the
 * weekday columns line up like a traditional calendar.
 *
 * Holds seven columns at EVERY breakpoint. It used to collapse to
 * `grid-cols-1` below `sm`, which turns a month into a 31-item vertical stack;
 * the performance calendar states the rule directly, that stacking a month
 * into a list is the one layout that destroys the point of a calendar. On a
 * phone the cells drop content instead (one logo, no ticker) rather than
 * dropping the shape.
 */
export function MonthCalendarGrid({ monthKey, days, today, mySymbols, onOpenDay }: MonthCalendarGridProps) {
  const { t } = useTranslation('tools');
  const byDate = new Map(days.map((d) => [d.date, d]));
  const weeks = monthWeeks(monthKey);
  const { gridRef, onKeyDown, activeDate } = useGridKeyboardNav(7);

  const firstWithEvents = days.find((d) => d.total > 0)?.date ?? null;
  const tabStop = activeDate ?? firstWithEvents;

  return (
    <div className="flex flex-col gap-1.5">
      <WeekdayHeader className="grid grid-cols-7 gap-1 sm:gap-1.5 mb-0.5" />

      <div
        ref={gridRef}
        className="flex flex-col gap-1 sm:gap-1.5"
        role="grid"
        aria-label={t('calendarMonthGridAriaLabel')}
        onKeyDown={onKeyDown}
      >
        {weeks.map((week, i) => (
          <div key={i} className="grid grid-cols-7 gap-1 sm:gap-1.5" role="row">
            {week.map((date, j) =>
              date === null ? (
                <div key={`pad-${i}-${j}`} aria-hidden="true" />
              ) : (
                <DayCell
                  key={date}
                  model={byDate.get(date) ?? EMPTY_DAY(date)}
                  today={today}
                  mySymbols={mySymbols}
                  onOpenDay={onOpenDay}
                  compact
                  tabIndex={date === tabStop ? 0 : -1}
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
    <div className="flex flex-col gap-1 sm:gap-1.5" aria-hidden="true">
      {weeks.map((week, i) => (
        <div key={i} className="grid grid-cols-7 gap-1 sm:gap-1.5">
          {week.map((date, j) => (
            <Skeleton
              key={j}
              className={cn('rounded-lg min-h-[52px] sm:min-h-[100px]', date === null && 'invisible')}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
