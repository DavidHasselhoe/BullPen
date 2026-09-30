'use client';

import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { TermTooltip } from '@/components/ui/TermTooltip';
import type { SignalValue } from '@/lib/finance/health-score';

/**
 * MetricCard — the shared tile scaffold for visual metrics.
 *
 * Layout: glossary-aware label → big tabular-nums value (+ signal glyph) →
 * viz slot (children) → one plain-language insight line. One card answers
 * one question; anything more belongs in a disclosure elsewhere.
 */

interface MetricCardProps {
  /** Glossary term — rendered through TermTooltip (plain label + ? in simplified mode). */
  label: string;
  /** Pre-formatted primary value. */
  value: string;
  signal?: SignalValue;
  /** One plain-language sentence, e.g. "Trading 8% below its 1-year high". */
  insight?: string;
  /** Optional second, quieter line — e.g. sector context ("Cheaper than most Technology companies"). */
  context?: string;
  /** Stable data-tour anchor (Academy tours target these). */
  tourId?: string;
  ticker?: string;
  onAskAI?: (q: string) => void;
  /** The viz slot. */
  children?: ReactNode;
  className?: string;
}

/**
 * The Health Score's verdict on this metric, as words. It used to be a bare
 * ▲/▼, which read as "went up/down" and contradicted the copy under it
 * (Dividend Yield 0.23% ▲ above "Pays less than most payers"). Neutral shows
 * nothing: a chip that says "fine" on every card is noise.
 */
const CHIP: Record<Exclude<SignalValue, 'neutral'>, { label: string; hint: string; cls: string }> = {
  positive: {
    label: 'metricSignalStrength',
    hint: 'metricSignalStrengthHint',
    cls: 'border-emerald-500/30 text-emerald-700 dark:text-emerald-400',
  },
  negative: {
    label: 'metricSignalWeak',
    hint: 'metricSignalWeakHint',
    cls: 'border-red-500/30 text-red-600 dark:text-red-400',
  },
};

export function MetricCard({ label, value, signal, insight, context, tourId, ticker, onAskAI, children, className }: MetricCardProps) {
  const { t } = useTranslation('common');
  const chip = signal && signal !== 'neutral' ? CHIP[signal] : null;
  return (
    <div
      data-tour={tourId}
      className={cn(
        'flex h-full flex-col gap-2.5 rounded-xl border border-border/60 p-4 transition-colors hover:border-border',
        className
      )}
    >
      <div className="text-xs text-muted-foreground">
        <TermTooltip term={label} ticker={ticker} onAskAI={onAskAI} />
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xl font-semibold leading-none tabular-nums text-foreground">{value}</span>
        {chip && value !== '—' && (
          <span
            className={cn('self-center rounded-full border px-1.5 py-0.5 text-xs font-medium leading-none', chip.cls)}
            title={t(chip.hint)}
          >
            {t(chip.label)}
          </span>
        )}
      </div>
      {children}
      {(insight || context) && (
        <div className="mt-auto space-y-0.5">
          {insight && <p className="text-xs leading-relaxed text-muted-foreground">{insight}</p>}
          {context && <p className="text-xs leading-relaxed text-muted-foreground">{context}</p>}
        </div>
      )}
    </div>
  );
}
