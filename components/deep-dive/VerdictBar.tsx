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
import { HealthRing } from '@/components/finance/HealthRing';
import { DELAYED_QUOTE_MINUTES } from '@/lib/market-data/ws-coverage';
import { cn } from '@/lib/utils';
import type { DeepDivePrice } from '@/hooks/use-deep-dive-price';
import type { HealthScore } from '@/lib/finance/health-score';
import type { Verdict } from '@/lib/ai/deep-dive/schema';

const STANCE_STYLE: Record<Verdict['stance'], { label: string; cls: string }> = {
  bullish: { label: 'Bullish', cls: 'text-emerald-500' },
  bearish: { label: 'Bearish', cls: 'text-red-500' },
  neutral: { label: 'Neutral', cls: 'text-muted-foreground' },
  mixed: { label: 'Mixed', cls: 'text-amber-600 dark:text-amber-400' },
};

const CONFIDENCE_LABEL: Record<Verdict['confidence'], string> = {
  high: 'High confidence',
  medium: 'Medium confidence',
  low: 'Low confidence',
};

/**
 * The teaching line, shown only when the two readings genuinely point opposite
 * ways. Thresholds match the health score's own grade bands (see
 * scoreToGrade): A/B is 70+, D/F is under 55.
 */
function mismatchNote(score: number, stance: Verdict['stance']): string | null {
  if (score >= 70 && stance === 'bearish') {
    return 'The financials are strong but this report is still cautious. A good business and a good buy at today\'s price are two different questions.';
  }
  if (score < 55 && stance === 'bullish') {
    return 'This report is positive despite weak financials today, so the case rests on what changes from here rather than on the current numbers.';
  }
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
    <div className="flex min-w-0 flex-col items-center justify-center text-center sm:px-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
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

  const { price, changePct, isLive } = priceInfo;
  // Flat is its own state, not a gain. `>= 0` painted an unchanged price
  // emerald with a "+" in front of it, which reads as a small rise.
  const direction = changePct == null || Math.abs(changePct) < 0.005 ? 'flat' : changePct > 0 ? 'up' : 'down';

  const stance = STANCE_STYLE[verdict.stance];
  const note = health ? mismatchNote(health.score, verdict.stance) : null;
  const showHealth = healthLoading || !!health;

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
      <div
        className={cn(
          'grid gap-5 sm:divide-x sm:divide-border/40',
          showHealth ? 'sm:grid-cols-3' : 'sm:grid-cols-2'
        )}
      >
        {showHealth && (
          <Cell label="Financial health">
            {healthLoading || !health ? (
              <div className="h-[68px] w-[68px] animate-shimmer rounded-full" />
            ) : (
              // Ring and word as one centered unit, and nothing else. A
              // "What the numbers say" gloss used to sit under the word; at a
              // third of the bar's width it wrapped to two lines while the
              // other two cells kept single-line sub-text, which is exactly
              // the lopsidedness this layout is meant to remove. The cell
              // label already says these are the financials, and the note
              // under the bar explains the split when the two readings
              // actually disagree.
              <div className="flex items-center justify-center gap-3">
                <HealthRing
                  score={health.score}
                  grade={health.grade}
                  pillars={health.categories}
                  size={68}
                  className="shrink-0 text-foreground"
                />
                <p className="text-lg font-bold leading-tight text-foreground">{health.label}</p>
              </div>
            )}
          </Cell>
        )}

        <Cell label="AI view">
          <p className={cn('text-2xl font-bold leading-none', stance.cls)}>{stance.label}</p>
          <p className="mt-2 text-xs leading-tight text-muted-foreground/85">
            {CONFIDENCE_LABEL[verdict.confidence]}
          </p>
        </Cell>

        <Cell label="Price today">
          {price != null ? (
            <>
              <p className="text-2xl font-bold tabular-nums leading-none text-foreground">
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
                  {direction === 'up' ? '+' : ''}
                  {changePct.toFixed(2)}% today
                </p>
              )}
              {/* Say which feed this is. A delayed number presented as live is
                  the kind of quiet inaccuracy that costs trust in every other
                  figure on the page. */}
              {!isLive && (
                <p className="mt-1 text-[10px] leading-tight text-muted-foreground/70">
                  {DELAYED_QUOTE_MINUTES} min delayed
                </p>
              )}
            </>
          ) : (
            <div className="h-7 w-24 animate-shimmer rounded" />
          )}
        </Cell>
      </div>

      {note && (
        <p className="mt-3 border-t border-border/40 pt-3 text-xs leading-relaxed text-muted-foreground">
          {note}
        </p>
      )}
    </div>
  );
}
