'use client';

import { cn } from '@/lib/utils';
import { CompactEventRow } from './EventRows';
import { fmtDayHeader } from '@/lib/dates/calendar-format';
import type { DayModel } from './types';

interface DayCellProps {
  model: DayModel;
  today: string;
  mySymbols: Set<string>;
  onOpenDay: (date: string) => void;
}

export function DayCell({ model, today, mySymbols, onOpenDay }: DayCellProps) {
  const isToday = model.date === today;

  if (model.total === 0) {
    return (
      <div className="flex flex-col gap-1 rounded-lg p-2 min-h-[104px]">
        <span className={cn(
          'text-[10px] font-bold uppercase tracking-wide',
          isToday ? 'text-primary' : 'text-muted-foreground/70',
        )}>
          {fmtDayHeader(model.date)}
        </span>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => onOpenDay(model.date)}
      className={cn(
        'flex flex-col gap-1.5 rounded-lg p-2 min-h-[104px] text-left border transition-all hover:shadow-md hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isToday ? 'bg-primary/[0.06] border-primary/30' : 'border-border/50 hover:border-border',
      )}
    >
      <span className={cn(
        'text-[10px] font-bold uppercase tracking-wide',
        isToday ? 'text-primary' : 'text-muted-foreground/70',
      )}>
        {fmtDayHeader(model.date)}
      </span>
      <div className="flex flex-col gap-1">
        {model.shown.map((event, i) => (
          <CompactEventRow
            key={`${event.type}-${event.symbol}-${i}`}
            event={event}
            isMine={mySymbols.has(event.symbol.toUpperCase())}
          />
        ))}
      </div>
      {model.moreCount > 0 && (
        <span className="text-[10px] text-muted-foreground/80 font-medium mt-auto pt-0.5">
          +{model.moreCount} more
        </span>
      )}
    </button>
  );
}
