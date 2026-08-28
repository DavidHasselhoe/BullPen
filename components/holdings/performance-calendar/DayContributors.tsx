'use client';

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { fmtFullDate } from '@/lib/dates/calendar-format';
import type { CurrencyCode } from '@/lib/currency/currency-conversion';
import type { DailyPerformanceDay } from '@/lib/holdings/daily-performance';
import { fmtSignedCurrency, fmtSignedPercent, signClass, textClass } from './calendar-model';

interface Props {
  day: DailyPerformanceDay;
  fxRate: number;
  currency: CurrencyCode;
  isToday?: boolean;
}

/**
 * What actually moved the portfolio on a given day.
 *
 * The per-symbol closes are already fetched to build the grid, so attributing a
 * day to its holdings costs nothing extra — and it's the question a coloured
 * cell immediately provokes. Trading-journal calendars stop at the day total.
 */
export function DayContributors({ day, fxRate, currency, isToday }: Props) {
  const { t } = useTranslation('holdings');
  const amount = day.pnlUsd * fxRate;
  const maxAbs = Math.max(...day.contributors.map((c) => Math.abs(c.pnlUsd)), 1);

  return (
    <div className="text-sm">
      <div className="px-3 py-2.5 border-b border-border">
        <p className="text-xs text-muted-foreground">{fmtFullDate(day.date)}</p>
        <div className="mt-1 flex items-baseline gap-2">
          <span className={cn('font-mono tabular-nums text-base font-semibold', textClass(day.pct))}>
            {fmtSignedPercent(day.pct)}
          </span>
          <span className="font-mono tabular-nums text-xs text-muted-foreground">
            {fmtSignedCurrency(amount, currency)}
          </span>
        </div>
      </div>

      {day.contributors.length === 0 ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">
          {t('perfCalNoPositionMoved')}
        </p>
      ) : (
        <ul className="py-1">
          {day.contributors.map((c) => {
            const contribution = c.pnlUsd * fxRate;
            const width = (Math.abs(c.pnlUsd) / maxAbs) * 100;
            return (
              <li key={c.symbol} className="relative px-3 py-1.5">
                {/* Proportional fill, so the ranking reads before any number does. */}
                <span
                  aria-hidden="true"
                  className={cn(
                    'absolute inset-y-0.5 left-0 rounded-r-sm',
                    c.pnlUsd >= 0 ? 'bg-gain/10' : 'bg-loss/10'
                  )}
                  style={{ width: `${width}%` }}
                />
                <span className="relative flex items-baseline justify-between gap-3">
                  <span className="min-w-0 flex items-baseline gap-1.5">
                    <span className="font-mono text-xs font-medium truncate">{c.symbol}</span>
                    <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                      {fmtSignedPercent(c.pricePct)}
                    </span>
                  </span>
                  <span
                    className={cn(
                      'font-mono tabular-nums text-xs shrink-0',
                      signClass(c.pnlUsd)
                    )}
                  >
                    {fmtSignedCurrency(contribution, currency)}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {isToday && (
        <p className="px-3 pb-2.5 pt-1 text-xs text-muted-foreground">
          {t('perfCalStillMoving')}
        </p>
      )}
    </div>
  );
}
