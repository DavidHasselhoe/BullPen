'use client';

import { useTranslation } from 'react-i18next';
import { DayCell } from './DayCell';
import { WEEKDAY_LABELS } from '@/lib/dates/calendar-format';
import { useGridKeyboardNav } from './useGridKeyboardNav';
import type { DayModel } from './types';

interface CalendarGridProps {
  days: DayModel[];
  today: string;
  mySymbols: Set<string>;
  onOpenDay: (date: string) => void;
}

/**
 * Seven-column week grid.
 *
 * Only rendered at `sm` and up — below that the page swaps to the list view
 * for the same range, because a 375px viewport leaves ~41px per column, which
 * cannot carry a logo and a ticker. Dropping to a single stacked column (the
 * previous behaviour) turns a week into a 7-item list that happens to look
 * like a broken calendar; an actual list is the better answer.
 */
export function CalendarGrid({ days, today, mySymbols, onOpenDay }: CalendarGridProps) {
  const { t } = useTranslation('tools');
  const { gridRef, onKeyDown, activeDate } = useGridKeyboardNav(7);
  const firstWithEvents = days.find((d) => d.total > 0)?.date ?? null;
  const tabStop = activeDate ?? firstWithEvents;

  return (
    <div ref={gridRef} role="grid" aria-label={t('calendarWeekGridAriaLabel')} className="min-w-0" onKeyDown={onKeyDown}>
      <div className="grid grid-cols-7 gap-2" role="row">
        {days.map((model) => (
          <DayCell
            key={model.date}
            model={model}
            today={today}
            mySymbols={mySymbols}
            onOpenDay={onOpenDay}
            tabIndex={model.date === tabStop ? 0 : -1}
          />
        ))}
      </div>
    </div>
  );
}

/** Weekday header row, shared by the week and month grids. */
export function WeekdayHeader({ className }: { className?: string }) {
  return (
    <div className={className} role="row">
      {WEEKDAY_LABELS.map((label) => (
        <div
          key={label}
          role="columnheader"
          className="text-center text-xs font-bold uppercase tracking-wide text-muted-foreground/60"
        >
          <span className="sm:hidden">{label.slice(0, 1)}</span>
          <span className="hidden sm:inline">{label}</span>
        </div>
      ))}
    </div>
  );
}
