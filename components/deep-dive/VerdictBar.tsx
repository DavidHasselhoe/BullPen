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
import { useStockQuote } from '@/hooks/use-stock-price';
import { useLivePrices } from '@/hooks/use-live-prices';
import { cn } from '@/lib/utils';
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

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 sm:px-4 sm:first:pl-0 sm:last:pr-0">
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground/80">
        {label}
      </p>
      {children}
    </div>
  );
}

export function VerdictBar({ ticker, verdict }: { ticker: string; verdict: Verdict }) {
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

  // The quote seeds the number; the live stream keeps it honest.
  //
  // This deliberately subscribes even though StockPricePanel below holds its
  // own subscription for the same symbol (useLivePrices opens one EventSource
  // per call site, it doesn't share). On the cached quote alone this cell drifts
  // from the chart a few hundred pixels beneath it, and the gap widens the
  // longer the page sits open: 1 cent apart on first look, 7 by the next.
  // Two different numbers for one fact on one screen is the kind of thing that
  // makes a reader stop trusting every other number on the page, which costs
  // more than a second stream on a low-traffic Pro page.
  //
  // The real fix is one shared subscription per page. That means teaching
  // StockPricePanel to accept a price instead of fetching its own, which is a
  // change to a 900-line component that isn't worth bundling into this.
  const { data: quote } = useStockQuote(ticker);
  const live = useLivePrices([ticker]).get(ticker);

  const prevClose = quote?.pc ?? 0;
  const price = live?.price ?? quote?.c ?? null;
  // Derived from prevClose rather than taken from whichever source supplied the
  // price, so the percentage can never describe a different price than the one
  // shown next to it.
  const changePct =
    price != null && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : (quote?.dp ?? null);
  const up = (changePct ?? 0) >= 0;

  const stance = STANCE_STYLE[verdict.stance];
  const note = health ? mismatchNote(health.score, verdict.stance) : null;
  const showHealth = healthLoading || !!health;

  return (
    <div className="rounded-xl border border-border/50 bg-muted/20 p-4">
      <div
        className={cn(
          'grid gap-4 sm:divide-x sm:divide-border/40',
          showHealth ? 'sm:grid-cols-[auto_1fr_1fr]' : 'sm:grid-cols-2'
        )}
      >
        {showHealth && (
          <Cell label="Financial health">
            {healthLoading || !health ? (
              <div className="h-16 w-16 animate-shimmer rounded-full" />
            ) : (
              <div className="flex items-center gap-3">
                <HealthRing
                  score={health.score}
                  grade={health.grade}
                  pillars={health.categories}
                  size={64}
                  className="shrink-0 text-foreground"
                />
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-foreground">{health.label}</p>
                  <p className="text-[11px] leading-tight text-muted-foreground/85">
                    What the numbers say
                  </p>
                </div>
              </div>
            )}
          </Cell>
        )}

        <Cell label="AI view">
          <p className={cn('text-xl font-bold leading-none', stance.cls)}>{stance.label}</p>
          <p className="mt-1.5 text-[11px] leading-tight text-muted-foreground/85">
            {CONFIDENCE_LABEL[verdict.confidence]}
          </p>
        </Cell>

        <Cell label="Price today">
          {price != null ? (
            <>
              <p className="text-xl font-bold tabular-nums leading-none text-foreground">
                ${price.toFixed(2)}
              </p>
              {changePct != null && (
                <p
                  className={cn(
                    'mt-1.5 text-[11px] font-medium tabular-nums leading-tight',
                    up ? 'text-emerald-500' : 'text-red-500'
                  )}
                >
                  {up ? '+' : ''}
                  {changePct.toFixed(2)}% today
                </p>
              )}
            </>
          ) : (
            <div className="h-6 w-20 animate-shimmer rounded" />
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
