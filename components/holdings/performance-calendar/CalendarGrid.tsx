'use client';

import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { WEEKDAY_LABELS } from '@/lib/dates/calendar-format';
import { summarize } from '@/lib/holdings/daily-performance';
import type { CurrencyCode } from '@/lib/currency/currency-conversion';
import { DayCell } from './DayCell';
import {
  fmtCompactSignedCurrency,
  fmtSignedPercent,
  monthHasWeekendData,
  textClass,
  type DayCellModel,
} from './calendar-model';

interface Props {
  weeks: DayCellModel[][];
  fxRate: number;
  currency: CurrencyCode;
  compact?: boolean;
}

/**
 * Day columns plus a week-total column. Seven columns when the portfolio
 * trades weekends (crypto), five (Mon–Fri) otherwise — an empty Sat/Sun
 * column that can never fill in for a stocks-only portfolio is dead weight
 * in a grid meant to show a month's shape at a glance. Whichever count is
 * showing holds at every breakpoint; stacking a month into a list is the one
 * layout that destroys the point of a calendar. Below `sm` the week-total
 * column and the per-cell currency line drop out instead.
 *
 * The two class strings below MUST stay literal, not built by concatenation —
 * Tailwind only generates a utility it finds as a complete string in source.
 */
const GRID_COLS_7 = 'grid-cols-7 sm:grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,0.9fr)]';
const GRID_COLS_5 = 'grid-cols-5 sm:grid-cols-[repeat(5,minmax(0,1fr))_minmax(0,0.9fr)]';

export function CalendarGrid({ weeks, fxRate, currency, compact }: Props) {
  const { t } = useTranslation('holdings');
  const gridRef = useRef<HTMLDivElement>(null);
  const [activeDate, setActiveDate] = useState<string | null>(null);

  const showWeekend = useMemo(() => monthHasWeekendData(weeks), [weeks]);
  const dayCols = showWeekend ? 7 : 5;
  const gridColsClass = showWeekend ? GRID_COLS_7 : GRID_COLS_5;
  const weekdayLabels = showWeekend ? WEEKDAY_LABELS : WEEKDAY_LABELS.slice(0, 5);

  // Roving tabindex: the grid is ONE tab stop, not thirty-one. Tabbing through
  // a month to reach the content after it is the kind of thing that makes
  // keyboard users avoid a page entirely.
  const firstDataDate = useMemo(
    () => weeks.flat().find((c) => c.state === 'data')?.date ?? null,
    [weeks]
  );
  const tabStop = activeDate ?? firstDataDate;

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Up/down must skip a full rendered row — 7 when weekends are showing,
    // 5 when they're collapsed away — or ArrowDown lands a row short/long.
    const step =
      e.key === 'ArrowLeft' ? -1 :
      e.key === 'ArrowRight' ? 1 :
      e.key === 'ArrowUp' ? -dayCols :
      e.key === 'ArrowDown' ? dayCols :
      undefined;
    if (step === undefined || !gridRef.current) return;

    const cells = Array.from(gridRef.current.querySelectorAll<HTMLElement>('[data-cal-cell]'));
    const from = cells.findIndex((c) => c.contains(e.target as Node));
    if (from < 0) return;

    // Walk past padding and holidays rather than dead-ending on them: a cell
    // with no data can't take focus, but it shouldn't block the journey.
    for (let i = from + step; i >= 0 && i < cells.length; i += step) {
      if (cells[i].tagName === 'BUTTON') {
        e.preventDefault();
        cells[i].focus();
        return;
      }
    }
  };

  return (
    <div
      ref={gridRef}
      role="grid"
      aria-label={t('perfCalGridAriaLabel')}
      className="min-w-0"
      onKeyDown={handleKeyDown}
    >
      {/* Column headers. Monday-first keeps Mon–Fri contiguous, so the trading
          week reads as one block and the weekend (when shown) sits beside the
          week total. */}
      <div className={cn('grid gap-1 sm:gap-1.5 mb-1.5', gridColsClass)}>
        {weekdayLabels.map((label) => (
          <div
            key={label}
            role="columnheader"
            className="text-xs font-medium uppercase tracking-wider text-muted-foreground/60 text-center"
          >
            <span aria-hidden="true">{label.slice(0, 1)}</span>
            <span className="sr-only">{label}</span>
          </div>
        ))}
        <div
          role="columnheader"
          className="hidden sm:block text-xs font-medium uppercase tracking-wider text-muted-foreground/60 text-center"
        >
          {t('perfCalWeekColHeader')}
        </div>
      </div>

      <div className="flex flex-col gap-1 sm:gap-1.5">
        {weeks.map((week, i) => {
          // Weekend cells are still summed into the week total even when not
          // rendered — moot when showWeekend is false (by definition nothing
          // qualifying lives there), but keeps the total correct either way.
          const weekDays = week
            .map((cell) => cell.data)
            .filter((d): d is NonNullable<typeof d> => d !== null);
          const weekTotal = summarize(weekDays);
          const renderedCells = showWeekend ? week : week.slice(0, 5);

          return (
            <div
              key={i}
              role="row"
              className={cn('grid gap-1 sm:gap-1.5', gridColsClass)}
            >
              {renderedCells.map((cell, j) => (
                <DayCell
                  key={cell.date ?? `pad-${j}`}
                  model={cell}
                  fxRate={fxRate}
                  currency={currency}
                  compact={compact}
                  tabIndex={cell.date && cell.date === tabStop ? 0 : -1}
                  onFocus={cell.date ? () => setActiveDate(cell.date) : undefined}
                />
              ))}

              <div
                role="gridcell"
                className={cn(
                  'hidden sm:flex flex-col justify-center items-end pr-1 pl-2',
                  'border-l border-border/40'
                )}
              >
                {weekDays.length > 0 ? (
                  <>
                    <span
                      className={cn(
                        'font-mono tabular-nums text-xs font-medium whitespace-nowrap',
                        textClass(weekTotal.pct)
                      )}
                    >
                      {fmtSignedPercent(weekTotal.pct)}
                    </span>
                    {!compact && (
                      <span className="font-mono tabular-nums text-xs text-muted-foreground whitespace-nowrap">
                        {fmtCompactSignedCurrency(weekTotal.pnlUsd * fxRate, currency)}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-xs text-muted-foreground/40" aria-hidden="true">
                    —
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
