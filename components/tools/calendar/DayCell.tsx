'use client';

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { LogoTile, LOGO_PX, TYPE_ICONS } from './LogoTile';
import { compactMetric } from './EventRows';
import { EconomicChip } from './EconomicEvents';
import { fmtDayHeader, fmtFullDate } from '@/lib/dates/calendar-format';
import { useClock } from '@/hooks/use-clock';
import { fmtClockTime } from '@/lib/dates/clock';
import { etWallToUnix } from '@/lib/market-data/trading-day';
import type { DayModel, EventType, MarketDayNote } from './types';

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
          <span key={type} className="flex items-center gap-0.5 text-xs leading-none text-muted-foreground">
            <Icon className="h-2.5 w-2.5" aria-hidden />
            <span className="tabular-nums">{counts[type]}</span>
          </span>
        );
      })}
    </span>
  );
}

/**
 * "Market closed · Thanksgiving" or "Closes 7:00 PM · Day after Thanksgiving".
 * Neutral, not a warning: nothing is wrong, the exchange is just shut. In a
 * month cell it shrinks to one word (the name is in the title tooltip), and on
 * a phone-width month column to nothing: the muted cell carries it there.
 */
export function MarketDayChip({ note, date, compact }: { note: MarketDayNote; date: string; compact?: boolean }) {
  const { t } = useTranslation('tools');
  useClock(); // re-render when the time zone or 12/24h clock changes
  let label = t('calendarMarketClosed');
  if (!note.closed && note.earlyCloseET) {
    const [y, m, d] = date.split('-').map(Number);
    const [hh, mm] = note.earlyCloseET.split(':').map(Number);
    label = t('calendarMarketClosesAt', { time: fmtClockTime(new Date(etWallToUnix(y, m, d, hh, mm) * 1000)) });
  }
  if (compact) {
    return (
      <span title={note.name ? `${label} · ${note.name}` : label} className="hidden text-xs font-medium leading-tight text-muted-foreground sm:block">
        {note.closed ? t('calendarMarketClosedShort') : t('calendarMarketHalfDayShort')}
      </span>
    );
  }
  return (
    <span className="flex flex-col rounded-md border border-border/70 bg-foreground/[0.04] px-1.5 py-0.5 text-xs leading-tight">
      <span className="font-medium text-foreground">{label}</span>
      {note.name && <span className="text-muted-foreground">{note.name}</span>}
    </span>
  );
}

export function DayCell({ model, today, mySymbols, onOpenDay, compact, tabIndex }: DayCellProps) {
  const { t } = useTranslation('tools');
  const isToday = model.date === today;
  // Week cells no longer force a fixed height: hero tiles are big enough that
  // a quiet day and a busy day should read as visibly different heights,
  // rather than every column padded out to match the busiest one.
  const heightClass = compact ? 'min-h-[52px] sm:min-h-[100px]' : 'min-h-[92px]';
  const paddingClass = compact ? 'p-1 sm:p-1.5' : 'p-2.5';
  const dayLabel = compact ? String(Number(model.date.slice(8, 10))) : fmtDayHeader(model.date);

  const headerClass = cn(
    'text-xs font-bold uppercase tracking-wide leading-none',
    isToday ? 'text-primary' : 'text-muted-foreground',
  );

  const closedAllDay = model.market?.closed === true;
  const marketChip = model.market && <MarketDayChip note={model.market} date={model.date} compact={compact} />;

  if (model.total === 0 && model.economic.length === 0) {
    return (
      <div
        data-cal-cell
        data-date={model.date}
        className={cn('flex flex-col gap-1 rounded-lg', paddingClass, heightClass, closedAllDay && 'bg-muted/50')}
      >
        <span className={headerClass}>{dayLabel}</span>
        {marketChip}
      </div>
    );
  }

  return (
    <button
      type="button"
      data-cal-cell
      tabIndex={tabIndex}
      onClick={() => onOpenDay(model.date)}
      aria-label={t('calendarEventsAriaLabel', { count: model.total + model.economic.length, date: fmtFullDate(model.date) })}
      className={cn(
        'flex flex-col gap-1.5 rounded-lg text-left border transition-all',
        'hover:shadow-md hover:-translate-y-0.5 motion-reduce:hover:translate-y-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        paddingClass, heightClass,
        isToday ? 'bg-primary/[0.06] border-primary/30' : 'border-border/50 hover:border-border',
      )}
    >
      <span className={headerClass}>{dayLabel}</span>
      {marketChip}

      {/* Market-wide releases pinned above company events: a CPI print moves
          everything that day, so it outranks the day's 40th earnings report. */}
      {model.economic.length > 0 && (
        <span className={cn('flex gap-1', compact ? 'flex-wrap' : 'flex-col')}>
          {model.economic.map((e) => <EconomicChip key={e.id} event={e} compact={compact} />)}
        </span>
      )}

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
              <span className="text-xs font-medium leading-none text-muted-foreground">{t('calendarMoreLabel')}</span>
            </span>
          )}
        </span>
      )}

      {compact && model.moreCount > 0 && (
        <span className="text-xs font-medium leading-none text-muted-foreground">
          +{model.moreCount}
          <span className="hidden sm:inline"> {t('calendarMoreLabel')}</span>
        </span>
      )}

      {!compact && <TypeCountStrip counts={model.typeCounts} />}
    </button>
  );
}
