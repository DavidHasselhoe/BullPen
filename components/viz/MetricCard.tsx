'use client';

import type { ReactNode } from 'react';
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

const GLYPH: Record<SignalValue, { char: string; cls: string; title: string }> = {
  positive: { char: '▲', cls: 'text-emerald-500', title: 'Positive signal' },
  neutral: { char: '●', cls: 'text-amber-400', title: 'Neutral' },
  negative: { char: '▼', cls: 'text-red-500', title: 'Watch this metric' },
};

export function MetricCard({ label, value, signal, insight, context, tourId, ticker, onAskAI, children, className }: MetricCardProps) {
  const glyph = signal ? GLYPH[signal] : null;
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
        {glyph && value !== '—' && (
          <span className={cn('text-xs leading-none', glyph.cls)} title={glyph.title} aria-label={glyph.title}>
            {glyph.char}
          </span>
        )}
      </div>
      {children}
      {(insight || context) && (
        <div className="mt-auto space-y-0.5">
          {insight && <p className="text-xs leading-relaxed text-muted-foreground">{insight}</p>}
          {context && <p className="text-xs leading-relaxed text-muted-foreground/85">{context}</p>}
        </div>
      )}
    </div>
  );
}
