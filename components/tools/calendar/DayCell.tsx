'use client';

import { cn } from '@/lib/utils';
import { LogoTile, LOGO_PX, TYPE_ICONS } from './LogoTile';
import { compactMetric } from './EventRows';
import { fmtDayHeader, fmtFullDate } from '@/lib/dates/calendar-format';
import type { DayModel, EventType } from './types';

interface DayCellProps {
  model: DayModel;
  today: string;
  mySymbols: Set<string>;
  onOpenDay: (date: string) => void;
  /** Month-grid context: shorter cell, day-of-month number instead of the
   *  full "Mon, Aug 3" header (the weekday is already the column it's in). */
  compact?: boolean;
  /** Roving-tabindex: only the active cell is in the tab order. */
  tabIndex?: number;
}

/** Types other than earnings, in the order the footer strip lists them. */
const SECONDARY_TYPES: EventType[] = ['dividends', 'splits', 'ipo'];

/**
 * Counts for dividends/splits/IPOs on this day.
 *
 * Needed because ranking is purely by market cap and earnings outnumbers
 * everything else by an order of magnitude, so on a busy day the other three
 * types would never appear in a capped cell at all. A count strip keeps them
 * discoverable without giving them tiles they'd lose anyway.
 */
function TypeCountStrip({ counts }: { counts: Record<EventType, number> }) {
  const present = SECONDARY_TYPES.filter((t) => counts[t] > 0);
  if (present.length === 0) return null;

  return (
    <span className="mt-auto flex items-center gap-2 pt-1">
      {present.map((type) => {
        const Icon = TYPE_ICONS[type];
        return (
          <span key={type} className="flex items-center gap-0.5 text-xs leading-none text-muted-foreground/70">
            <Icon className="h-2.5 w-2.5" aria-hidden />
            <span className="tabular-nums">{counts[type]}</span>
          </span>
        );
      })}
    </span>
  );
}

export function DayCell({ model, today, mySymbols, onOpenDay, compact, tabIndex }: DayCellProps) {
  const isToday = model.date === today;
  // Week cells no longer force a fixed height: hero tiles are big enough that
  // a quiet day and a busy day should read as visibly different heights,
  // rather than every column padded out to match the busiest one.
  const heightClass = compact ? 'min-h-[52px] sm:min-h-[100px]' : 'min-h-[92px]';
  const paddingClass = compact ? 'p-1 sm:p-1.5' : 'p-2.5';
  const dayLabel = compact ? String(Number(model.date.slice(8, 10))) : fmtDayHeader(model.date);

  const headerClass = cn(
    'text-xs font-bold uppercase tracking-wide leading-none',
    isToday ? 'text-primary' : 'text-muted-foreground/70',
  );

  if (model.total === 0) {
    return (
      <div
        data-cal-cell
        data-date={model.date}
        className={cn('flex flex-col gap-1 rounded-lg', paddingClass, heightClass)}
      >
        <span className={headerClass}>{dayLabel}</span>
      </div>
    );
  }

  return (
    <button
      type="button"
      data-cal-cell
      tabIndex={tabIndex}
      onClick={() => onOpenDay(model.date)}
      aria-label={`${fmtFullDate(model.date)}, ${model.total} event${model.total === 1 ? '' : 's'}`}
      className={cn(
        'flex flex-col gap-1.5 rounded-lg text-left border transition-all',
        'hover:shadow-md hover:-translate-y-0.5 motion-reduce:hover:translate-y-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        paddingClass, heightClass,
        isToday ? 'bg-primary/[0.06] border-primary/30' : 'border-border/50 hover:border-border',
      )}
    >
      <span className={headerClass}>{dayLabel}</span>

      {compact ? (
        // Wrapped tile cluster, logo only. 4 per row at 20px + 4px gap = 92px,
        // inside the ~114px a month column gives.
        <span className="flex flex-wrap items-center gap-1">
          {model.shown.map((event, i) => (
            <LogoTile
              key={`${event.type}-${event.symbol}-${i}`}
              event={event}
              size="sm"
              showTicker={false}
              isMine={mySymbols.has(event.symbol.toUpperCase())}
              className={cn(i > 0 && 'hidden sm:flex')}
            />
          ))}
        </span>
      ) : (
        // Hero tiles: logo on top, ticker below, two per row. Fewer, bigger
        // tiles than the old one-per-row list — the day cell now grows to fit
        // its own content (see heightClass) instead of every column matching
        // the busiest day's fixed height.
        <span className="grid grid-cols-2 gap-1.5">
          {model.shown.map((event, i) => (
            <LogoTile
              key={`${event.type}-${event.symbol}-${i}`}
              event={event}
              size="xl"
              orientation="stack"
              metric={compactMetric(event)}
              isMine={mySymbols.has(event.symbol.toUpperCase())}
            />
          ))}
          {model.moreCount > 0 && (
            <span className="flex flex-col items-center gap-1 text-center">
              <span
                className="flex items-center justify-center rounded-lg bg-muted/60 font-mono text-xs font-bold text-muted-foreground"
                style={{ width: LOGO_PX.xl, height: LOGO_PX.xl }}
              >
                +{model.moreCount}
              </span>
              <span className="text-xs font-medium leading-none text-muted-foreground/80">more</span>
            </span>
          )}
        </span>
      )}

      {compact && model.moreCount > 0 && (
        <span className="text-xs font-medium leading-none text-muted-foreground/80">
          +{model.moreCount}
          <span className="hidden sm:inline"> more</span>
        </span>
      )}

      {!compact && <TypeCountStrip counts={model.typeCounts} />}
    </button>
  );
}
