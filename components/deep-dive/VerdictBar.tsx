'use client';

/**
 * Layer 1 of the Deep Dive report: the verdict, above the fold.
 *
 * Three stats, left to right: what the numbers say about the business (our own
 * computed health score), what this report concludes (the model's stance), and
 * what the stock costs today.
 *
 * Financial health and the AI view are deliberately SEPARATE stats rather than
 * one blended number. They answer different questions and they are allowed to
 * disagree: a financially strong company can still be a poor buy at today's
 * price. When they do disagree we say so out loud (see `mismatchNote`) instead
 * of hiding it, because that gap is the most useful thing a beginner can take
 * off this page.
 *
 * Explicitly NOT used here: the old BullBearGauge's stance+confidence lookup
 * table. That produced an identical number for every "bullish, medium" company
 * regardless of the company, which reads as fabricated the moment two stocks
 * are compared side by side. The health score is real computed data.
 */

import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { HealthRing } from '@/components/finance/HealthRing';
import { DELAYED_QUOTE_MINUTES } from '@/lib/market-data/ws-coverage';
import { cn } from '@/lib/utils';
import type { DeepDivePrice } from '@/hooks/use-deep-dive-price';
import type { HealthScore } from '@/lib/finance/health-score';
import type { Verdict } from '@/lib/ai/deep-dive/schema';

const STANCE_STYLE: Record<Verdict['stance'], { key: string; cls: string }> = {
  bullish: { key: 'deepDiveStanceBullish', cls: 'text-emerald-500' },
  bearish: { key: 'deepDiveStanceBearish', cls: 'text-red-500' },
  neutral: { key: 'deepDiveStanceNeutral', cls: 'text-muted-foreground' },
  mixed: { key: 'deepDiveStanceMixed', cls: 'text-amber-600 dark:text-amber-400' },
};

const CONFIDENCE_KEY: Record<Verdict['confidence'], string> = {
  high: 'deepDiveConfidenceHigh',
  medium: 'deepDiveConfidenceMedium',
  low: 'deepDiveConfidenceLow',
};

/**
 * The teaching line, shown only when the two readings genuinely point opposite
 * ways. Thresholds match the health score's own grade bands (see
 * scoreToGrade): A/B is 70+, D/F is under 55.
 */
function mismatchKey(score: number, stance: Verdict['stance']): string | null {
  if (score >= 70 && stance === 'bearish') return 'deepDiveMismatchStrongBearish';
  if (score < 55 && stance === 'bullish') return 'deepDiveMismatchWeakBullish';
  return null;
}

/**
 * Equal thirds, everything centered. The first cut sized the columns
 * [auto 1fr 1fr] with left-aligned content, so the health cell took the width
 * its ring needed and the other two sat against their left edges with a gap
 * of dead space trailing each one.
 */
function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-center justify-start text-center sm:justify-center sm:px-4">
      <p className="mb-2 text-xs font-medium text-muted-foreground">
        {label}
      </p>
      {children}
    </div>
  );
}

export function VerdictBar({
  ticker,
  verdict,
  price: priceInfo,
}: {
  ticker: string;
  verdict: Verdict;
  /** Resolved once per report by the parent, so every price on the page agrees. */
  price: DeepDivePrice;
}) {
  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ['health-score', ticker],
    queryFn: async (): Promise<HealthScore | null> => {
      const res = await fetch(`/api/stock/${ticker}/health-score`);
      const json = (await res.json()) as { success: boolean; data?: HealthScore };
      return json.success && json.data ? json.data : null;
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
    retry: false,
  });

  const { t } = useTranslation('tools');
  const { price, changePct, isLive, session } = priceInfo;
  // Flat is its own state, not a gain. `>= 0` painted an unchanged price
  // emerald with a "+" in front of it, which reads as a small rise.
  const direction = changePct == null || Math.abs(changePct) < 0.005 ? 'flat' : changePct > 0 ? 'up' : 'down';
  const pct = changePct == null ? '' : `${direction === 'up' ? '+' : ''}${changePct.toFixed(2)}%`;
  const changeKey = session === 'pre' ? 'deepDiveChangePre' : session === 'post' ? 'deepDiveChangePost' : 'deepDiveChangeToday';

  const stance = STANCE_STYLE[verdict.stance];
  const noteKey = health ? mismatchKey(health.score, verdict.stance) : null;
  const showHealth = healthLoading || !!health;

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
      {/* Columns on every width. Stacked on a phone, the three cells stood
          ~330px tall and pushed the report's headline below the fold. */}
      <div
        className={cn(
          'grid gap-2 divide-x divide-border/40 sm:gap-5',
          showHealth ? 'grid-cols-3' : 'grid-cols-2'
        )}
      >
        {showHealth && (
          <Cell label={t('deepDiveVerdictHealth')}>
            {healthLoading || !health ? (
              <div className="h-[52px] w-[52px] animate-shimmer rounded-full sm:h-[68px] sm:w-[68px]" />
            ) : (
              // Ring and word as one centered unit, and nothing else. A
              // "What the numbers say" gloss used to sit under the word; at a
              // third of the bar's width it wrapped to two lines while the
              // other two cells kept single-line sub-text, which is exactly
              // the lopsidedness this layout is meant to remove. The cell
              // label already says these are the financials, and the note
              // under the bar explains the split when the two readings
              // actually disagree.
              <div className="flex flex-col items-center justify-center gap-1.5 sm:flex-row sm:gap-3">
                <HealthRing
                  score={health.score}
                  grade={health.grade}
                  pillars={health.categories}
                  size={56}
                  className="shrink-0 text-foreground"
                />
                <p className="text-sm font-bold leading-tight text-foreground sm:text-lg">{health.label}</p>
              </div>
            )}
          </Cell>
        )}

        <Cell label={t('deepDiveVerdictAiView')}>
          <p className={cn('text-lg font-bold leading-none sm:text-2xl', stance.cls)}>{t(stance.key)}</p>
          <p className="mt-2 text-xs leading-tight text-muted-foreground">
            {t(CONFIDENCE_KEY[verdict.confidence])}
          </p>
        </Cell>

        <Cell label={t('deepDiveVerdictPrice')}>
          {price != null ? (
            <>
              <p className="font-mono text-lg font-bold tabular-nums leading-none text-foreground sm:text-2xl">
                ${price.toFixed(2)}
              </p>
              {changePct != null && (
                <p
                  className={cn(
                    'mt-2 text-xs font-medium tabular-nums leading-tight',
                    direction === 'up' && 'text-emerald-500',
                    direction === 'down' && 'text-red-500',
                    direction === 'flat' && 'text-muted-foreground'
                  )}
                >
                  {t(changeKey, { pct })}
                </p>
              )}
              {/* Say which feed this is. A delayed number presented as live is
                  the kind of quiet inaccuracy that costs trust in every other
                  figure on the page. */}
              {!isLive && (
                <p className="mt-1 text-xs leading-tight text-muted-foreground">
                  {t('deepDiveDelayed', { minutes: DELAYED_QUOTE_MINUTES })}
                </p>
              )}
            </>
          ) : (
            <div className="h-7 w-24 animate-shimmer rounded" />
          )}
        </Cell>
      </div>

      {noteKey && (
        <p className="mt-3 border-t border-border/40 pt-3 text-xs leading-relaxed text-muted-foreground">
          {t(noteKey)}
        </p>
      )}
    </div>
  );
}
