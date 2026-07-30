'use client';

import { DayCell } from './DayCell';
import type { DayModel } from './types';

interface CalendarGridProps {
  days: DayModel[];
  today: string;
  mySymbols: Set<string>;
  onOpenDay: (date: string) => void;
}

/** Real 7-column week grid at `sm` and up; a single stacked column below it. */
export function CalendarGrid({ days, today, mySymbols, onOpenDay }: CalendarGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-7 gap-2">
      {days.map((model) => (
        <DayCell
          key={model.date}
          model={model}
          today={today}
          mySymbols={mySymbols}
          onOpenDay={onOpenDay}
        />
      ))}
    </div>
  );
}
