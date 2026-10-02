'use client';

import { useMemo, useState } from 'react';
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { intlLocale } from '@/lib/i18n/intl-locale';
import type { NormalizedPoint, SeriesPoint } from '@/lib/picks/types';
import { fmtPct } from './pick-format';

type Mode = 'calendar' | 'normalized';
type Range = '1M' | '3M' | '6M' | '1Y' | 'MAX';

const RANGES: Range[] = ['1M', '3M', '6M', '1Y', 'MAX'];
const RANGE_DAYS: Record<Range, number> = {
  '1M': 31, '3M': 92, '6M': 183, '1Y': 365, MAX: Number.POSITIVE_INFINITY,
};

// Resolved from CSS custom properties so both series stay readable in light and
// dark mode — see the note beside --picks-up in globals.css.
const UP = 'var(--picks-up)';
const DOWN = 'var(--picks-down)';
const BENCHMARK = 'var(--picks-benchmark)';

interface Props {
  series: SeriesPoint[];
  normalized: NormalizedPoint[];
  className?: string;
}

interface CalendarPointRow extends SeriesPoint { label: string }

function fmtAxisDate(t: number, locale: string): string {
  return new Date(t * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/**
 * The track record, two ways.
 *
 * "Portfolio" is the honest headline view: $100 into every pick on its own
 * entry date, charted as cumulative return so adding a new pick never lifts the
 * line, against the S&P bought on exactly the same schedule.
 *
 * "Since pick" answers a different question — how a typical pick behaves after
 * it's flagged — and its sample shrinks as the axis extends, so the count is
 * printed in the tooltip rather than left for the reader to assume.
 */
export function PicksPerformanceChart({ series, normalized, className }: Props) {
  const { t, i18n } = useTranslation('discover');
  const locale = intlLocale(i18n.language);
  const [mode, setMode] = useState<Mode>('calendar');
  const [range, setRange] = useState<Range>('MAX');

  const calendarData = useMemo<CalendarPointRow[]>(() => {
    if (series.length === 0) return [];
    // Measure the window back from the series' own last point rather than the
    // wall clock: keeps this render pure, and means a cached payload still
    // shows a full window instead of a short one clipped by elapsed time.
    const end = series[series.length - 1].t;
    const cutoff = RANGE_DAYS[range] === Number.POSITIVE_INFINITY
      ? -Infinity
      : end - RANGE_DAYS[range] * 86_400;
    const filtered = series.filter((p) => p.t >= cutoff);
    // Never render a single lonely point — fall back to the full series.
    const use = filtered.length >= 2 ? filtered : series;
    return use.map((p) => ({ ...p, label: fmtAxisDate(p.t, locale) }));
  }, [series, range, locale]);

  const last = calendarData[calendarData.length - 1];
  const isUp = mode === 'calendar'
    ? (last?.picksPct ?? 0) >= 0
    : (normalized[normalized.length - 1]?.avgPct ?? 0) >= 0;
  const pickColor = isUp ? UP : DOWN;
  const gradientId = `picks-grad-${isUp ? 'up' : 'down'}`;

  const hasCalendar = calendarData.length >= 2;
  const hasNormalized = normalized.length >= 2;
  const active = mode === 'calendar' ? hasCalendar : hasNormalized;

  return (
    <div className={cn('rounded-xl border border-border/50 bg-card/40', className)}>
      {/* ── Controls ───────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 pt-4 sm:px-5">
        <div role="tablist" aria-label={t('pickChartViewLabel')} className="flex items-center gap-0.5 rounded-md bg-muted/50 p-0.5">
          <ModeTab active={mode === 'calendar'} onClick={() => setMode('calendar')}>
            {t('pickChartPortfolio')}
          </ModeTab>
          <ModeTab active={mode === 'normalized'} onClick={() => setMode('normalized')}>
            {t('pickChartSincePick')}
          </ModeTab>
        </div>

        {mode === 'calendar' && (
          <div className="flex items-center gap-0.5 rounded-md bg-muted/50 p-0.5">
            {RANGES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRange(r)}
                aria-pressed={r === range}
                className={cn(
                  'rounded px-2 py-1 text-[11px] font-medium tabular-nums transition-colors duration-150',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background',
                  r === range
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Legend: always present, and each series also carries a distinct
             line style so identity never rests on colour alone ─────────────── */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 px-4 pt-3 sm:px-5">
        <LegendItem color={pickColor} label={mode === 'calendar' ? t('pickChartLegendPicks') : t('pickChartLegendAverage')} />
        {mode === 'calendar' ? (
          <LegendItem color={BENCHMARK} label={t('pickChartLegendBenchmark')} dashed />
        ) : (
          <LegendItem color={BENCHMARK} label={t('pickChartLegendMedian')} dashed />
        )}
      </div>

      {/* ── Plot ───────────────────────────────────────────────────────────── */}
      <div className="px-1 pb-3 pt-2">
        {!active ? (
          <div className="flex h-[260px] items-center justify-center px-6 text-center text-sm text-muted-foreground">
            {t('pickChartNotEnough')}
          </div>
        ) : mode === 'calendar' ? (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={calendarData} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={pickColor} stopOpacity={0.2} />
                  <stop offset="80%" stopColor={pickColor} stopOpacity={0.02} />
                  <stop offset="100%" stopColor={pickColor} stopOpacity={0} />
                </linearGradient>
              </defs>

              <CartesianGrid stroke="var(--chart-grid)" strokeOpacity={0.35} vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fill: 'var(--chart-label)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                dy={6}
                minTickGap={40}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: 'var(--chart-label)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={44}
                tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
              />
              <ReferenceLine y={0} stroke="var(--chart-grid)" strokeWidth={1} strokeOpacity={0.9} />

              <Tooltip
                cursor={{ stroke: 'var(--chart-crosshair)', strokeOpacity: 0.35, strokeWidth: 1 }}
                content={({ active: on, payload }) => {
                  if (!on || !payload?.length) return null;
                  const p = payload[0].payload as CalendarPointRow;
                  return (
                    <TooltipBox title={new Date(p.t * 1000).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}>
                      <TooltipRow color={pickColor} label={t('pickChartLegendPicks')} value={fmtPct(p.picksPct)} />
                      <TooltipRow color={BENCHMARK} label={t('pickChartTooltipSp')} value={fmtPct(p.benchmarkPct)} dashed />
                      <p className="pt-1 text-[11px] text-muted-foreground">
                        {t('pickChartHeld', { count: p.liveCount })}
                      </p>
                    </TooltipBox>
                  );
                }}
              />

              <Area
                type="monotone"
                dataKey="picksPct"
                stroke={pickColor}
                strokeWidth={2}
                fill={`url(#${gradientId})`}
                dot={false}
                activeDot={{ r: 4, fill: pickColor, strokeWidth: 0 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="benchmarkPct"
                stroke={BENCHMARK}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                activeDot={{ r: 3, fill: BENCHMARK, strokeWidth: 0 }}
                isAnimationActive={false}
                connectNulls
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={normalized} margin={{ top: 8, right: 16, bottom: 0, left: 8 }}>
              <CartesianGrid stroke="var(--chart-grid)" strokeOpacity={0.35} vertical={false} />
              <XAxis
                dataKey="day"
                type="number"
                domain={['dataMin', 'dataMax']}
                tick={{ fill: 'var(--chart-label)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                dy={6}
                minTickGap={32}
                tickFormatter={(d: number) => `D${d}`}
              />
              <YAxis
                tick={{ fill: 'var(--chart-label)', fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                width={44}
                tickFormatter={(v: number) => `${v > 0 ? '+' : ''}${v.toFixed(0)}%`}
              />
              <ReferenceLine y={0} stroke="var(--chart-grid)" strokeWidth={1} strokeOpacity={0.9} />

              <Tooltip
                cursor={{ stroke: 'var(--chart-crosshair)', strokeOpacity: 0.35, strokeWidth: 1 }}
                content={({ active: on, payload }) => {
                  if (!on || !payload?.length) return null;
                  const p = payload[0].payload as NormalizedPoint;
                  return (
                    <TooltipBox title={t('pickChartDaysAfter', { count: p.day })}>
                      <TooltipRow color={pickColor} label={t('pickChartAverage')} value={fmtPct(p.avgPct)} />
                      <TooltipRow color={BENCHMARK} label={t('pickChartMedian')} value={fmtPct(p.medianPct)} dashed />
                      <p className="pt-1 text-[11px] text-muted-foreground">
                        {t('pickChartBasedOn', { count: p.n })}
                      </p>
                    </TooltipBox>
                  );
                }}
              />

              <Line
                type="monotone"
                dataKey="avgPct"
                stroke={pickColor}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: pickColor, strokeWidth: 0 }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="medianPct"
                stroke={BENCHMARK}
                strokeWidth={1.5}
                strokeDasharray="4 3"
                dot={false}
                activeDot={{ r: 3, fill: BENCHMARK, strokeWidth: 0 }}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {mode === 'normalized' && hasNormalized && (
        <p className="px-4 pb-4 text-[11px] leading-relaxed text-muted-foreground sm:px-5">
          {t('pickChartSampleNote')}
        </p>
      )}
    </div>
  );
}

// ─── Pieces ──────────────────────────────────────────────────────────────────

function ModeTab({
  active, onClick, children,
}: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        'rounded px-3 py-1 text-xs font-medium transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1 focus-visible:ring-offset-background',
        active ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg width="18" height="8" aria-hidden className="shrink-0">
        <line
          x1="0" y1="4" x2="18" y2="4"
          stroke={color}
          strokeWidth={dashed ? 1.5 : 2}
          strokeDasharray={dashed ? '4 3' : undefined}
        />
      </svg>
      <span className="text-[11px] font-medium text-muted-foreground">{label}</span>
    </span>
  );
}

function TooltipBox({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1 rounded-lg border border-border bg-background/95 px-3 py-2 text-xs shadow-lg backdrop-blur-sm">
      <p className="pb-0.5 font-medium text-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

function TooltipRow({
  color, label, value, dashed,
}: { color: string; label: string; value: string; dashed?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <svg width="14" height="6" aria-hidden className="shrink-0">
        <line
          x1="0" y1="3" x2="14" y2="3"
          stroke={color}
          strokeWidth={dashed ? 1.5 : 2}
          strokeDasharray={dashed ? '3 2' : undefined}
        />
      </svg>
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto font-mono font-semibold tabular-nums text-foreground">{value}</span>
    </div>
  );
}
