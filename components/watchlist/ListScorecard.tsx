'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Info, LineChart as LineChartIcon } from 'lucide-react';
import { ListScoreChart } from './ListScoreChart';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { ListScore, TodaySummary } from '@/lib/watchlist/scorecard';

interface ListScorecardProps {
  listId: string;
  today: TodaySummary | null;
  /** Since-added record vs the S&P 500; null when nothing is priced yet. */
  score: ListScore | null;
  scoreLoading: boolean;
  /** Every pick was added today, so there is no close to measure from yet. */
  allNew: boolean;
  grades: string[];
}

const GRADE_ORDER = ['A', 'B', 'C', 'D', 'F'];

function signed(n: number) {
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

/** Signal colors only: emerald up, red down, nothing for flat. */
function tone(n: number) {
  return n > 0 ? 'text-emerald-500' : n < 0 ? 'text-red-500' : 'text-foreground';
}

function Stat({ label, children }: { label: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-lg bg-muted/40 px-3 py-2.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}

/**
 * The list strip above the cards: today's equal-weight move, and how the
 * list's picks have done since they were added against the S&P 500. Percent
 * only. These are stocks someone watched, not money they made.
 */
export function ListScorecard({ listId, today, score, scoreLoading, allNew, grades }: ListScorecardProps) {
  const { t } = useTranslation('watchlist');
  const [chartOpen, setChartOpen] = useState(false);

  const gradeMix = GRADE_ORDER
    .map((g) => ({ g, n: grades.filter((x) => x === g).length }))
    .filter((x) => x.n > 0);

  const gap = score ? score.pct - score.benchPct : 0;

  return (
    <div className="flex flex-col gap-2">
      <section aria-label={t('scorecardAriaLabel')} className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label={t('scorecardToday')}>
          {today ? (
            <>
              <span className={cn('font-mono text-lg font-semibold tabular-nums', tone(today.avg))}>{signed(today.avg)}</span>
              <span className="text-xs text-muted-foreground">
                {t('scorecardUpDownFlat', { up: today.up, down: today.down, flat: today.flat })}
              </span>
            </>
          ) : <Skeleton className="h-6 w-20" />}
        </Stat>
  
        <Stat label={t('scorecardBestWorst')}>
          {today ? (
            <div className="flex flex-col font-mono text-sm font-medium tabular-nums">
              <span className={tone(today.best.changePercent)}>{today.best.symbol} {signed(today.best.changePercent)}</span>
              <span className={tone(today.worst.changePercent)}>{today.worst.symbol} {signed(today.worst.changePercent)}</span>
            </div>
          ) : <Skeleton className="h-10 w-24" />}
        </Stat>
  
        <Stat
          label={
            <span className="flex items-center gap-1">
              {t('scorecardSinceAdded')}
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="-m-2 rounded-full p-2 text-muted-foreground transition-colors hover:text-foreground"
                    aria-label={t('scorecardExplainAriaLabel')}
                  >
                    <Info className="h-3.5 w-3.5" />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-72 text-sm leading-relaxed">
                  {t('scorecardExplain')}
                </PopoverContent>
              </Popover>
            </span>
          }
        >
          {scoreLoading ? (
            <Skeleton className="h-10 w-28" />
          ) : score ? (
            <>
              <span className={cn('font-mono text-lg font-semibold tabular-nums', tone(score.pct))}>{signed(score.pct)}</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {t('scorecardBenchmark', { pct: signed(score.benchPct) })}
              </span>
              <span className="text-xs text-muted-foreground">
                {Math.abs(gap) < 0.05
                  ? t('scorecardLevel')
                  : t(gap > 0 ? 'scorecardAhead' : 'scorecardBehind', { points: Math.abs(gap).toFixed(1) })}
                {score.removed > 0 && <> · {t('scorecardIncludesRemoved', { count: score.removed })}</>}
              </span>
              <button
                type="button"
                onClick={() => setChartOpen((o) => !o)}
                aria-expanded={chartOpen}
                className="mt-1 flex w-fit items-center gap-1 rounded-md py-1 text-xs font-medium text-primary transition-colors hover:text-primary/80"
              >
                <LineChartIcon className="h-3.5 w-3.5" aria-hidden />
                {chartOpen ? t('scorecardChartHide') : t('scorecardChartShow')}
              </button>
            </>
          ) : (
            <span className="text-xs text-muted-foreground">{allNew ? t('scorecardStartsTomorrow') : t('scorecardUnavailable')}</span>
          )}
        </Stat>
  
        <Stat label={t('scorecardHealth')}>
          {gradeMix.length > 0 ? (
            <span className="text-sm font-medium tabular-nums text-foreground">
              {gradeMix.map((x) => `${x.n} ${x.g}`).join(' · ')}
            </span>
          ) : <span className="text-xs text-muted-foreground">{t('scorecardUnavailable')}</span>}
        </Stat>
      </section>
      {chartOpen && <ListScoreChart listId={listId} />}
    </div>
  );
}
