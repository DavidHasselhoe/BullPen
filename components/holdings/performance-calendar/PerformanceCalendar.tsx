'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  currentMonthKey,
  fmtMonthLabel,
  fmtShortDate,
  monthWeeks,
  shiftMonth,
} from '@/lib/dates/calendar-format';
import { summarize } from '@/lib/holdings/daily-performance';
import type { CurrencyCode } from '@/lib/currency/currency-conversion';
import { CalendarGrid } from './CalendarGrid';
import { useDailyPerformance } from './use-daily-performance';
import {
  buildMonthGrid,
  fmtSignedCurrency,
  fmtSignedPercent,
  textClass,
} from './calendar-model';

interface Props {
  currency?: CurrencyCode;
  /** 1 USD = X `currency` at today's rate. Scales amounts; percentages are FX-free. */
  fxRate?: number;
  /** Tighter cells and a trimmed summary, for the homepage widget. */
  compact?: boolean;
  className?: string;
}

export function PerformanceCalendar({
  currency = 'USD',
  fxRate = 1,
  compact = false,
  className,
}: Props) {
  const { t } = useTranslation('holdings');
  const thisMonth = currentMonthKey();
  const [month, setMonth] = useState(thisMonth);

  const { days, holidays, isLoading, isGated } = useDailyPerformance(month);

  const weeks = useMemo(() => buildMonthGrid(month, days, holidays), [month, days, holidays]);
  const total = useMemo(() => summarize(days), [days]);

  const atCurrentMonth = month === thisMonth;
  const hasData = days.length > 0;

  return (
    <div className={cn('min-w-0', className)}>
      {/* Month navigation */}
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="flex items-center gap-1 min-w-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setMonth(shiftMonth(month, -1))}
            aria-label={t('perfCalPrevMonth', { month: fmtMonthLabel(shiftMonth(month, -1)) })}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium tabular-nums truncate px-1">
            {fmtMonthLabel(month)}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={() => setMonth(shiftMonth(month, 1))}
            disabled={atCurrentMonth}
            aria-label={t('perfCalNextMonth', { month: fmtMonthLabel(shiftMonth(month, 1)) })}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        {!atCurrentMonth && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs text-muted-foreground shrink-0"
            onClick={() => setMonth(thisMonth)}
          >
            {t('perfCalToday')}
          </Button>
        )}
      </div>

      {/* Month summary */}
      <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1 mb-4 min-h-[28px]">
        {isLoading ? (
          <Skeleton className="h-6 w-40" />
        ) : hasData ? (
          <>
            <span
              className={cn(
                'font-mono tabular-nums text-lg font-semibold',
                textClass(total.pct)
              )}
            >
              {fmtSignedPercent(total.pct)}
            </span>
            <span className="font-mono tabular-nums text-sm text-muted-foreground">
              {fmtSignedCurrency(total.pnlUsd * fxRate, currency)}
            </span>
            <span className="text-xs text-muted-foreground/70">
              {t('perfCalUpDown', { up: total.upDays, down: total.downDays })}
            </span>
            {!compact && total.best && total.worst && (
              <span className="text-xs text-muted-foreground/70">
                {t('perfCalBestWorst', {
                  bestDate: fmtShortDate(total.best.date),
                  bestPct: fmtSignedPercent(total.best.pct),
                  worstDate: fmtShortDate(total.worst.date),
                  worstPct: fmtSignedPercent(total.worst.pct),
                })}
              </span>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  className="text-muted-foreground/50 hover:text-muted-foreground transition-colors"
                  aria-label={t('perfCalHowCalculated')}
                >
                  <Info className="h-3.5 w-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent
                side="top"
                className="max-w-[280px] leading-snug bg-popover text-popover-foreground border border-border shadow-lg"
              >
                {t('perfCalAccuracyNote')}
              </TooltipContent>
            </Tooltip>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            {isGated
              ? t('perfCalGatedLong')
              : t('perfCalNoPositionsMonth', { month: fmtMonthLabel(month) })}
          </span>
        )}
      </div>

      {isLoading ? <GridSkeleton month={month} compact={compact} /> : (
        <CalendarGrid weeks={weeks} fxRate={fxRate} currency={currency} compact={compact} />
      )}
    </div>
  );
}

function GridSkeleton({ month, compact }: { month: string; compact?: boolean }) {
  // Skeleton mirrors the real month's week count so the block doesn't resize
  // when data lands.
  const rows = monthWeeks(month).length;
  const height = compact ? 'h-[48px] sm:h-[64px]' : 'h-[52px] sm:h-[76px]';

  return (
    <div className="flex flex-col gap-1 sm:gap-1.5" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="grid grid-cols-7 sm:grid-cols-[repeat(7,minmax(0,1fr))_minmax(0,0.9fr)] gap-1 sm:gap-1.5"
        >
          {Array.from({ length: 7 }).map((__, j) => (
            <Skeleton key={j} className={cn('rounded-lg', height)} />
          ))}
          <div className="hidden sm:block" />
        </div>
      ))}
    </div>
  );
}
