'use client';

import { CalendarOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { fmtFullDate } from '@/lib/dates/calendar-format';
import type { CurrencyCode } from '@/lib/currency/currency-conversion';
import {
  cellTextClass,
  dayAriaLabel,
  fmtCompactSignedCurrency,
  fmtShortPercent,
  fmtSignedPercent,
  tintClass,
  type DayCellModel,
} from './calendar-model';
import { DayContributors } from './DayContributors';

interface Props {
  model: DayCellModel;
  /** 1 USD = X display currency. Applied to amounts only; percentages are FX-free. */
  fxRate: number;
  currency: CurrencyCode;
  compact?: boolean;
  /** Roving tabindex, owned by CalendarGrid — only one cell is a tab stop. */
  tabIndex?: number;
  onFocus?: () => void;
}

export function DayCell({ model, fxRate, currency, compact, tabIndex, onFocus }: Props) {
  const { t } = useTranslation('holdings');
  // Type stays on DESIGN.md's ramp (Body 14 / Label 12) at every size; the day
  // number recedes by weight and colour rather than by dropping below the
  // ramp's floor, which is where dense grids start feeling like a terminal.
  const heightClass = compact ? 'min-h-[48px] sm:min-h-[64px]' : 'min-h-[52px] sm:min-h-[76px]';

  if (model.state === 'pad') {
    return <div data-cal-cell aria-hidden="true" />;
  }

  // Non-trading day, or one before the portfolio existed. Recessed rather than
  // shown as 0.00% — "the market was shut" and "you broke even" are different
  // facts and shouldn't look identical.
  //
  // Deliberately no "today" ring here. Before the first bar of the day exists
  // (pre-market, or a weekend), ringing an otherwise empty cell makes the one
  // cell with nothing in it the loudest thing on the grid. The primary-coloured
  // day number is marker enough until there's a number to frame.
  if (model.state !== 'data' || !model.data) {
    const isHoliday = model.state === 'holiday';
    return (
      <div
        data-cal-cell
        role="gridcell"
        title={isHoliday ? model.holidayLabel! : undefined}
        aria-label={
          isHoliday ? `${fmtFullDate(model.date!)}. ${t('perfCalMarketClosedFor', { holiday: model.holidayLabel })}` : undefined
        }
        className={cn(
          'rounded-lg p-1 sm:p-2 flex flex-col',
          heightClass,
          model.state === 'future' ? 'border border-dashed border-border/40' : 'bg-muted/20'
        )}
      >
        <span
          className={cn(
            'text-xs leading-none tabular-nums',
            model.isToday ? 'font-semibold text-primary' : 'text-muted-foreground'
          )}
        >
          {model.dayOfMonth}
        </span>
        {/* Names the closure instead of leaving a cell indistinguishable from
            missing data — sourced from the same exchange_holidays table the
            Market Hours widget reads, so the two never disagree. */}
        {isHoliday && (
          <span className="flex-1 flex flex-col items-center justify-center gap-0.5 min-w-0 text-muted-foreground/60">
            <CalendarOff className="h-3 w-3 sm:h-3.5 sm:w-3.5 shrink-0" aria-hidden="true" />
            <span className="hidden sm:block text-xs leading-tight text-center truncate w-full">
              {model.holidayLabel}
            </span>
          </span>
        )}
      </div>
    );
  }

  const { pct, pnlUsd } = model.data;
  const amount = pnlUsd * fxRate;
  const label = dayAriaLabel(fmtFullDate(model.date!), pct, amount, currency);
  const tone = cellTextClass(pct);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          data-cal-cell
          role="gridcell"
          aria-label={label}
          tabIndex={tabIndex}
          onFocus={onFocus}
          className={cn(
            'rounded-lg p-1 sm:p-2 flex flex-col text-left w-full',
            'transition-[transform,box-shadow] duration-150 ease-out',
            'hover:-translate-y-0.5 hover:shadow-md active:scale-[0.97]',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            heightClass,
            tintClass(pct),
            model.isToday && 'ring-1 ring-primary/30'
          )}
        >
          {/* The date is the cell's label, not decoration — it stays a real
              foreground shade rather than a faint tint-on-tint grey, which
              measured as low as 2.46:1 on the strong bands. Hierarchy comes
              from size and weight against the semibold percentage instead. */}
          <span
            className={cn(
              'text-xs leading-none tabular-nums',
              model.isToday ? 'font-semibold text-primary' : 'text-foreground/70'
            )}
          >
            {model.dayOfMonth}
          </span>

          <span className="flex-1 flex flex-col justify-center min-w-0">
            <span
              className={cn(
                'font-mono tabular-nums font-semibold leading-tight truncate',
                // 12px on phones so seven columns still fit at 375px; 14px from
                // sm up, where there's room for the headline to actually lead.
                compact ? 'text-xs' : 'text-xs sm:text-sm',
                tone.primary
              )}
            >
              <span className="sm:hidden">{fmtShortPercent(pct)}</span>
              <span className="hidden sm:inline">{fmtSignedPercent(pct)}</span>
            </span>
            {/* Currency is the confirming number, not the headline — and it is
                the first thing to go when the cell gets narrow. */}
            <span
              className={cn(
                'hidden sm:block font-mono tabular-nums text-xs leading-tight truncate',
                tone.secondary
              )}
            >
              {fmtCompactSignedCurrency(amount, currency)}
            </span>
          </span>
        </button>
      </PopoverTrigger>

      <PopoverContent align="center" className="w-64 p-0">
        <DayContributors
          day={model.data}
          fxRate={fxRate}
          currency={currency}
          isToday={model.isToday}
        />
      </PopoverContent>
    </Popover>
  );
}
