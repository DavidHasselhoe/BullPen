'use client';

/**
 * EarningsDotChart: expected vs actual earnings per share, one column a
 * quarter, oldest on the left, the next report last.
 *
 * A hollow ring is the analysts' forecast, a filled dot what the company
 * earned, a thin line between them the size of the beat or miss. Each column
 * is a button; the chosen one's numbers and date read out in a line under the
 * chart, so values never need a hover tooltip on a phone. Direction is always
 * a sign and a word as well as a color (Never-Color-Alone).
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface EarningsDotColumn {
  key: string;
  /** "Q3 FY27", already translated. */
  label: string;
  /** "Nov 17, 2026", already formatted. */
  date: string;
  estimate: number | null;
  actual: number | null;
  /** The actual isn't final: read from the press release by AI, or not yet checked against filed financials. */
  provisional?: 'release' | 'unconfirmed';
  /** The next report: estimate only. */
  upcoming?: boolean;
  /** The next report's date is projected, not announced. */
  estimatedDate?: boolean;
}

const money = (v: number) => `${v < 0 ? '−' : ''}$${Math.abs(v).toFixed(2)}`;

type Verdict = 'beat' | 'missed' | 'met' | null;
function verdictOf(c: EarningsDotColumn): Verdict {
  if (c.actual == null || c.estimate == null) return null;
  const diff = Math.round((c.actual - c.estimate) * 100);
  return diff > 0 ? 'beat' : diff < 0 ? 'missed' : 'met';
}

/** "$0.21 (+9%)"; no percent off a near-zero forecast, where any rounding reads as a huge surprise. */
function diffText(c: EarningsDotColumn): string {
  const diff = Math.abs(c.actual! - c.estimate!);
  const pct = Math.abs(c.estimate!) >= 0.05 ? ((c.actual! - c.estimate!) / Math.abs(c.estimate!)) * 100 : null;
  return pct == null ? money(diff) : `${money(diff)} (${pct >= 0 ? '+' : '−'}${Math.abs(pct).toFixed(0)}%)`;
}

const VERDICT_TEXT = { beat: 'text-emerald-600 dark:text-emerald-400', missed: 'text-red-600 dark:text-red-400', met: 'text-muted-foreground' } as const;
const VERDICT_DOT = { beat: 'bg-emerald-500', missed: 'bg-red-500', met: 'bg-foreground/70' } as const;

export function EarningsDotChart({ columns }: { columns: EarningsDotColumn[] }) {
  const { t } = useTranslation('stock');
  const latestPast = columns.reduce((acc, c, i) => (c.upcoming ? acc : i), columns.length - 1);
  const [picked, setPicked] = useState<string | null>(null);
  const selected = columns.find((c) => c.key === picked) ?? columns[latestPast];

  const values = columns.flatMap((c) => [c.estimate, c.actual]).filter((v): v is number => v != null);
  if (!values.length || !selected) return null;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  // 10-90% of the plot, so a dot at either end never touches the labels.
  const pos = (v: number) => (hi === lo ? 50 : 10 + ((v - lo) / (hi - lo)) * 80);

  const detail = (c: EarningsDotColumn): string => {
    if (c.upcoming) {
      return c.estimate != null ? t('earningsChartDetailUpcoming', { estimate: money(c.estimate) }) : '';
    }
    const v = verdictOf(c);
    if (c.actual == null) return c.estimate != null ? t('earningsChartDetailUpcoming', { estimate: money(c.estimate) }) : '';
    if (v == null) return t('earningsChartDetailNoEstimate', { actual: money(c.actual) });
    const base = t('earningsChartDetailReported', { actual: money(c.actual), estimate: money(c.estimate!) });
    const verdict = v === 'met' ? t('earningsChartDetailMet') : t(v === 'beat' ? 'earningsChartDetailBeat' : 'earningsChartDetailMissed', { diff: diffText(c) });
    return `${base} ${verdict}`;
  };
  const note = (c: EarningsDotColumn): string | null =>
    c.provisional === 'release' ? t('earningsChartFromRelease')
      : c.provisional === 'unconfirmed' ? t('earningsChartUnconfirmed')
        : c.upcoming && c.estimatedDate ? t('earningsChartDateProjected')
          : null;

  const anyProvisional = columns.some((c) => c.provisional);

  return (
    <div>
      <div
        role="group"
        aria-label={t('earningsChartLabel')}
        // Capped so the trend reads as one line on a wide card, not five far-apart dots.
        className="grid max-w-xl gap-1"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        {columns.map((c) => {
          const v = verdictOf(c);
          const isSelected = c === selected;
          return (
            <button
              key={c.key}
              type="button"
              aria-pressed={isSelected}
              aria-label={`${c.label}, ${c.date}. ${detail(c)}${note(c) ? ` ${note(c)}` : ''}`}
              onClick={() => setPicked(c.key)}
              className={cn(
                'flex min-w-0 cursor-pointer touch-manipulation flex-col items-center rounded-md px-0.5 pb-2 pt-1 transition-colors duration-150',
                'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                isSelected && 'bg-muted/60 hover:bg-muted/60',
              )}
            >
              <span className="relative block h-28 w-full" aria-hidden>
                {c.estimate != null && c.actual != null && (
                  <span
                    className="absolute left-1/2 w-px -translate-x-1/2 bg-foreground/25"
                    style={{ bottom: `${pos(Math.min(c.estimate, c.actual))}%`, height: `${Math.abs(pos(c.actual) - pos(c.estimate))}%` }}
                  />
                )}
                {c.estimate != null && (
                  <span
                    className="absolute left-1/2 size-3.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-foreground/45 bg-card"
                    style={{ bottom: `${pos(c.estimate)}%` }}
                  />
                )}
                {c.actual != null && (
                  <span
                    className={cn(
                      'absolute left-1/2 size-2.5 -translate-x-1/2 translate-y-1/2 rounded-full',
                      v ? VERDICT_DOT[v] : 'bg-foreground/70',
                      c.provisional && 'opacity-55 outline outline-1 outline-offset-2 outline-dashed outline-foreground/50',
                    )}
                    style={{ bottom: `${pos(c.actual)}%` }}
                  />
                )}
              </span>
              <span className={cn('mt-1 whitespace-nowrap text-xs', isSelected ? 'font-medium text-foreground' : 'text-muted-foreground')}>
                {c.label}
              </span>
              <span className={cn('mt-0.5 whitespace-nowrap font-mono text-xs tabular-nums leading-tight', v ? VERDICT_TEXT[v] : 'text-muted-foreground')}>
                {c.upcoming
                  ? t('earningsChartNext')
                  : v === 'met'
                    ? '$0.00'
                    : v
                      ? `${v === 'beat' ? '+' : '−'}${money(Math.abs(c.actual! - c.estimate!))}`
                      : '—'}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-3 text-sm leading-relaxed" aria-live="polite">
        <span className="font-medium">{selected.label}</span>
        <span className="text-muted-foreground"> · {selected.date}</span>
        <br />
        <span>{detail(selected)}</span>
        {note(selected) && <span className="text-muted-foreground"> {note(selected)}</span>}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-3 rounded-full border-2 border-foreground/45" />
          {t('earningsChartLegendExpected')}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="size-2.5 rounded-full bg-foreground/70" />
          {t('earningsChartLegendActual')}
        </span>
        {anyProvisional && (
          <span className="inline-flex items-center gap-1.5">
            <span aria-hidden className="size-2.5 rounded-full bg-foreground/70 opacity-55 outline outline-1 outline-offset-2 outline-dashed outline-foreground/50" />
            {t('earningsChartLegendProvisional')}
          </span>
        )}
        <span>{t('earningsChartBasis')}</span>
      </div>
    </div>
  );
}
