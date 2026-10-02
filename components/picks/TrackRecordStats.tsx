'use client';

import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { intlLocale } from '@/lib/i18n/intl-locale';
import { MIN_PICKS_FOR_HEADLINE, type PerformanceSummary } from '@/lib/picks/types';
import { DIRECTION_TEXT, directionOf, fmtDate, fmtPct } from './pick-format';

/**
 * The headline numbers.
 *
 * Below MIN_PICKS_FOR_HEADLINE the return figure is deliberately withheld and
 * replaced with a plain statement of how young the record is. Four picks can
 * show +40% purely by luck, and printing that number would be the single most
 * misleading thing this page could do.
 */
export function TrackRecordStats({ summary }: { summary: PerformanceSummary }) {
  const { t, i18n } = useTranslation('discover');
  const locale = intlLocale(i18n.language);

  if (summary.pickCount === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/40 px-5 py-8 text-center">
        <p className="text-sm text-muted-foreground">{t('pickStatsEmpty')}</p>
      </div>
    );
  }

  if (summary.insufficientSample) {
    // Count against picks made, not picks already priced: a pick published on a
    // Monday morning has no entry price until the open, and telling someone
    // "1 pick so far, 8 more to go" would just look like it can't count.
    const remaining = Math.max(0, MIN_PICKS_FOR_HEADLINE - summary.pickCount);
    return (
      <div className="rounded-xl border border-border/50 bg-card/40 px-5 py-6 sm:px-6">
        <p className="text-sm font-medium text-foreground">
          {t('pickStatsYoung', { count: summary.pickCount, date: fmtDate(summary.trackingSince, locale) })}
        </p>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          {t('pickStatsWithheld', { min: MIN_PICKS_FOR_HEADLINE })}{' '}
          {remaining > 0 && t('pickStatsRemaining', { count: remaining })}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">{t('pickStatsAllInTable')}</p>
      </div>
    );
  }

  const dir = directionOf(summary.totalReturnPct);
  const outDir = directionOf(summary.outperformancePct);
  const DirIcon = dir === 'up' ? ArrowUp : dir === 'down' ? ArrowDown : Minus;

  return (
    <div className="rounded-xl border border-border/50 bg-card/40 px-5 py-5 sm:px-6">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
        <div>
          <dt className={LABEL}>{t('pickStatAllPicks')}</dt>
          <dd
            className={cn(
              'mt-1.5 flex items-center gap-1 font-mono text-2xl font-bold tabular-nums',
              DIRECTION_TEXT[dir],
            )}
          >
            <DirIcon className="h-5 w-5" strokeWidth={2.5} aria-hidden />
            {fmtPct(summary.totalReturnPct)}
          </dd>
        </div>

        <Stat label={t('pickStatBenchmark')} value={fmtPct(summary.benchmarkReturnPct)} />

        <div>
          <dt className={LABEL}>{t('pickStatDifference')}</dt>
          <dd className={cn('mt-1.5 font-mono text-lg font-semibold tabular-nums', DIRECTION_TEXT[outDir])}>
            {fmtPct(summary.outperformancePct)}
            <span className="sr-only">
              {' '}{t(outDir === 'up' ? 'pickStatDiffAhead' : outDir === 'down' ? 'pickStatDiffBehind' : 'pickStatDiffLevel')}
            </span>
          </dd>
        </div>

        <Stat
          label={t('pickStatHitRate')}
          value={summary.hitRatePct != null ? `${summary.hitRatePct.toFixed(0)}%` : '—'}
          sub={t('pickStatInProfit', { winners: summary.winners, count: summary.trackedCount })}
        />

        <Stat
          label={t('pickStatTrackingSince')}
          value={fmtDate(summary.trackingSince, locale)}
          sub={t('pickStatPickCount', { count: summary.pickCount })}
          mono={false}
        />
      </dl>

      {(summary.bestPick || summary.worstPick) && (
        <p className="mt-5 border-t border-border/40 pt-4 text-xs leading-relaxed text-muted-foreground">
          {summary.bestPick && (
            <>
              {t('pickStatBest')}{' '}
              <span className="font-mono font-semibold text-foreground/80">{summary.bestPick.symbol}</span>{' '}
              <span className={cn('font-mono tabular-nums', DIRECTION_TEXT[directionOf(summary.bestPick.returnPct)])}>
                {fmtPct(summary.bestPick.returnPct)}
              </span>
              .
            </>
          )}
          {summary.worstPick && (
            <>
              {' '}{t('pickStatWorst')}{' '}
              <span className="font-mono font-semibold text-foreground/80">{summary.worstPick.symbol}</span>{' '}
              <span className={cn('font-mono tabular-nums', DIRECTION_TEXT[directionOf(summary.worstPick.returnPct)])}>
                {fmtPct(summary.worstPick.returnPct)}
              </span>
              .
            </>
          )}
        </p>
      )}
    </div>
  );
}

const LABEL = 'text-xs font-medium text-muted-foreground';

function Stat({ label, value, sub, mono = true }: { label: string; value: string; sub?: string; mono?: boolean }) {
  return (
    <div>
      <dt className={LABEL}>{label}</dt>
      <dd className={cn('mt-1.5 text-lg font-semibold text-foreground/90', mono && 'font-mono tabular-nums')}>
        {value}
      </dd>
      {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
