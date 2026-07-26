'use client';

import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
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
  if (summary.pickCount === 0) {
    return (
      <div className="rounded-xl border border-border/50 bg-card/40 px-5 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          The track record opens with the first pick. Nothing to show yet — which is
          exactly what it should say.
        </p>
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
          {summary.pickCount} {summary.pickCount === 1 ? 'pick' : 'picks'} since{' '}
          {fmtDate(summary.trackingSince)} — too early to judge.
        </p>
        <p className="mt-2 max-w-prose text-sm leading-relaxed text-muted-foreground">
          We won&apos;t publish a headline return until the record is at least{' '}
          {MIN_PICKS_FOR_HEADLINE} picks deep. Over a handful of picks the number
          would say more about luck than about the picking.{' '}
          {remaining > 0 && (
            <>
              {remaining} more to go — about {remaining} {remaining === 1 ? 'week' : 'weeks'}.
            </>
          )}
        </p>
        <p className="mt-3 text-sm text-muted-foreground">
          Every pick made so far is in the table below, including the ones that are down.
        </p>
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
          <dt className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50">
            All picks
          </dt>
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

        <Stat label="S&P, same dates" value={fmtPct(summary.benchmarkReturnPct)} />

        <div>
          <dt className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50">
            Difference
          </dt>
          <dd className={cn('mt-1.5 font-mono text-lg font-semibold tabular-nums', DIRECTION_TEXT[outDir])}>
            {fmtPct(summary.outperformancePct)}
            <span className="sr-only">
              {outDir === 'up' ? ' ahead of' : outDir === 'down' ? ' behind' : ' level with'} the benchmark
            </span>
          </dd>
        </div>

        <Stat
          label="Hit rate"
          value={summary.hitRatePct != null ? `${summary.hitRatePct.toFixed(0)}%` : '—'}
          sub={`${summary.winners} of ${summary.trackedCount} in profit`}
        />

        <Stat
          label="Tracking since"
          value={fmtDate(summary.trackingSince)}
          sub={`${summary.pickCount} ${summary.pickCount === 1 ? 'pick' : 'picks'}`}
        />
      </dl>

      {(summary.bestPick || summary.worstPick) && (
        <p className="mt-5 border-t border-border/40 pt-4 text-[12px] leading-relaxed text-muted-foreground">
          {summary.bestPick && (
            <>
              Best call so far:{' '}
              <span className="font-mono font-semibold text-foreground/80">{summary.bestPick.symbol}</span>{' '}
              <span className="font-mono tabular-nums text-emerald-400">
                {fmtPct(summary.bestPick.returnPct)}
              </span>
              .
            </>
          )}
          {summary.worstPick && (
            <>
              {' '}Worst:{' '}
              <span className="font-mono font-semibold text-foreground/80">{summary.worstPick.symbol}</span>{' '}
              <span className="font-mono tabular-nums text-red-400">
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

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-[10px] font-bold uppercase tracking-[0.15em] text-muted-foreground/50">
        {label}
      </dt>
      <dd className="mt-1.5 font-mono text-lg font-semibold tabular-nums text-foreground/90">
        {value}
      </dd>
      {sub && <p className="mt-0.5 text-[11px] text-muted-foreground/60">{sub}</p>}
    </div>
  );
}
