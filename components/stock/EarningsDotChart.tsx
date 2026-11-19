'use client';

/**
 * EarningsDotChart: expected vs actual earnings per share, one column a
 * quarter, oldest on the left, the next report last.
 *
 * A hollow ring is the analysts' forecast, a filled dot what the company
 * earned, a thin line between them the size of the beat or miss. Each column
 * is a button, picked by hovering, focusing or tapping it. Its numbers read out
 * in a panel beside the chart on a wide card and under it on a narrow one, so
 * values never need a tooltip. The panel opens with how many of the reports
 * shown beat the forecast. Direction is always a sign and a word as well as a
 * color (Never-Color-Alone).
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
const VERDICT_GLYPH = { beat: '▲', missed: '▼', met: '●' } as const;

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

  /** "Missed by $0.82 (−28%)." Leads the panel; null for the next report or a report with no forecast. */
  const verdictLine = (c: EarningsDotColumn): string | null => {
    const v = verdictOf(c);
    if (c.upcoming || v == null) return null;
    return v === 'met' ? t('earningsChartDetailMet') : t(v === 'beat' ? 'earningsChartDetailBeat' : 'earningsChartDetailMissed', { diff: diffText(c) });
  };
  /** The two numbers behind the verdict. */
  const factsLine = (c: EarningsDotColumn): string => {
    if (c.upcoming || c.actual == null) return c.estimate != null ? t('earningsChartDetailUpcoming', { estimate: money(c.estimate) }) : '';
    if (c.estimate == null) return t('earningsChartDetailNoEstimate', { actual: money(c.actual) });
    return t('earningsChartDetailReported', { actual: money(c.actual), estimate: money(c.estimate) });
  };
  const note = (c: EarningsDotColumn): string | null =>
    c.provisional === 'release' ? t('earningsChartFromRelease')
      : c.provisional === 'unconfirmed' ? t('earningsChartUnconfirmed')
        : c.upcoming && c.estimatedDate ? t('earningsChartDateProjected')
          : null;

  const anyProvisional = columns.some((c) => c.provisional);

  // The track record over the reports shown. An unconfirmed actual isn't
  // counted: it hasn't been checked against a filed statement yet, so it
  // shouldn't feed a confidence-implying stat.
  const scored = columns.filter((c) => !c.upcoming && c.provisional !== 'unconfirmed' && verdictOf(c) != null);
  const beats = scored.filter((c) => verdictOf(c) === 'beat').length;
  const misses = scored.filter((c) => verdictOf(c) === 'missed').length;
  const summary = scored.length < 2 ? null
    : misses > beats
      ? { count: misses, caption: t('earningsSummaryMissed'), tone: 'missed' as const }
      : { count: beats, caption: t('earningsSummaryBeat'), tone: beats > scored.length / 2 ? ('beat' as const) : ('met' as const) };
  const selectedVerdict = verdictLine(selected);
  const selectedNote = note(selected);

  return (
    <div className="@container">
      <div className="grid gap-x-8 gap-y-5 @3xl:grid-cols-[minmax(0,3fr)_minmax(15rem,2fr)] @3xl:items-center">
        <div>
          <div
            role="group"
            aria-label={t('earningsChartLabel')}
            // Capped when stacked so the trend reads as one line, not five far-apart dots.
            className="grid max-w-xl gap-1 @3xl:max-w-none"
            style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
          >
            {columns.map((c) => {
              const v = verdictOf(c);
              const isSelected = c === selected;
              const columnNote = note(c);
              return (
                <button
                  key={c.key}
                  type="button"
                  aria-pressed={isSelected}
                  aria-label={`${c.label}, ${c.date}. ${[verdictLine(c), factsLine(c), columnNote].filter(Boolean).join(' ')}`}
                  // Hover and focus pick a quarter, so sweeping across the chart reads
                  // them all. The pick stays when the pointer leaves. A tap is a click.
                  onClick={() => setPicked(c.key)}
                  onMouseEnter={() => setPicked(c.key)}
                  onFocus={() => setPicked(c.key)}
                  className={cn(
                    'flex min-w-0 cursor-pointer touch-manipulation flex-col items-center rounded-md px-0.5 pb-2 pt-1 transition-colors duration-150',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isSelected && 'bg-muted/60',
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
                  <span className={cn('mt-0.5 whitespace-nowrap text-xs leading-tight', !c.upcoming && 'font-mono tabular-nums', v ? VERDICT_TEXT[v] : 'text-muted-foreground')}>
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

        {/* Not aria-live: focusing a column already reads these numbers from its label. */}
        <div className="@3xl:border-l @3xl:border-border/60 @3xl:pl-8">
          {summary && (
            <div className="mb-4 border-b border-border/60 pb-4">
              <p className="flex items-baseline gap-2 text-2xl font-semibold tabular-nums">
                <span aria-hidden className={cn('text-sm', VERDICT_TEXT[summary.tone])}>{VERDICT_GLYPH[summary.tone]}</span>
                {t('earningsSummaryCount', { count: summary.count, total: scored.length })}
              </p>
              <p className="mt-0.5 text-sm text-muted-foreground">{summary.caption}</p>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">{selected.label}</span> · {selected.date}
          </p>
          {selectedVerdict && (
            <p className={cn('mt-1 text-base font-semibold tabular-nums', VERDICT_TEXT[verdictOf(selected)!])}>{selectedVerdict}</p>
          )}
          <p className={cn('text-sm leading-relaxed', selectedVerdict ? 'text-muted-foreground' : 'mt-1')}>{factsLine(selected)}</p>
          {selectedNote && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{selectedNote}</p>}
        </div>
      </div>
    </div>
  );
}
