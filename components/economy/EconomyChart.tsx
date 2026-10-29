'use client';

/**
 * History chart for one economic series. Neutral on purpose: an inflation
 * print or a rate cut is not a gain or a loss, so emerald and red stay out
 * (DESIGN.md One Signal Rule). The headline series is solid ink, a second one
 * (core, or the 4-week average) is muted.
 */

import { useSyncExternalStore } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ReferenceLine, ResponsiveContainer } from 'recharts';
import type { EconomicKind } from '@/lib/market-data/economic-kinds';
import type { HistoryRow, MetricKey } from '@/lib/market-data/economic-results';
import { fmtAxis, fmtMetric, fmtPeriod } from './format';

export interface ChartSeries {
  key: MetricKey;
  label: string;
}

const reducedMotionQuery = '(prefers-reduced-motion: reduce)';
function subscribeReducedMotion(cb: () => void) {
  const mq = window.matchMedia(reducedMotionQuery);
  mq.addEventListener('change', cb);
  return () => mq.removeEventListener('change', cb);
}

export function EconomyChart({
  kind,
  rows,
  series,
  type,
  referenceLine,
  locale,
  ariaLabel,
}: {
  kind: EconomicKind;
  rows: HistoryRow[];
  /** First is the headline. */
  series: ChartSeries[];
  type: 'line' | 'bar' | 'step';
  referenceLine?: { y: number; label: string };
  locale: string;
  ariaLabel: string;
}) {
  const reducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    () => window.matchMedia(reducedMotionQuery).matches,
    () => true,
  );
  const data = rows.map((r) => ({ period: r.period, ...r.values }));
  const headline = series[0].key;
  const animation = { isAnimationActive: !reducedMotion, animationDuration: 400 };
  const axis = { tickLine: false, axisLine: false, tick: { fontSize: 12, fill: 'var(--muted-foreground)' } };
  const xAxis = (
    <XAxis
      dataKey="period"
      {...axis}
      minTickGap={32}
      tickFormatter={(p: string) => fmtPeriod(kind, p, locale, true)}
    />
  );
  // With a target line, start at zero so the line sits inside the chart rather than on the axis.
  const yAxis = <YAxis {...axis} width={52} tickFormatter={(v: number) => fmtAxis(headline, v, locale)} domain={referenceLine ? [0, 'auto'] : ['auto', 'auto']} />;
  const tooltip = (
    <Tooltip
      cursor={type === 'bar' ? { fill: 'var(--muted)', opacity: 0.4 } : { stroke: 'var(--border)' }}
      contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
      labelStyle={{ color: 'var(--muted-foreground)' }}
      itemStyle={{ color: 'var(--popover-foreground)' }}
      labelFormatter={(p) => fmtPeriod(kind, String(p), locale)}
      formatter={(value, name, item) => [fmtMetric(String(item.dataKey), Number(value), locale), name]}
    />
  );

  return (
    <div role="img" aria-label={ariaLabel}>
      {series.length > 1 && (
        <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-muted-foreground" aria-hidden>
          {series.map((s, i) => (
            <span key={s.key} className="flex items-center gap-1.5">
              <span className={i === 0 ? 'h-0.5 w-3 rounded bg-foreground' : 'h-0.5 w-3 rounded bg-muted-foreground/60'} />
              {s.label}
            </span>
          ))}
        </div>
      )}
      <div className="h-[220px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'bar' ? (
            <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              {xAxis}
              {yAxis}
              {tooltip}
              <ReferenceLine y={0} stroke="var(--border)" />
              <Bar dataKey={headline} name={series[0].label} fill="var(--foreground)" fillOpacity={0.5} radius={[3, 3, 0, 0]} activeBar={{ fillOpacity: 0.8 }} {...animation} />
            </BarChart>
          ) : (
            <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
              {xAxis}
              {yAxis}
              {tooltip}
              {referenceLine && (
                <ReferenceLine
                  y={referenceLine.y}
                  stroke="var(--muted-foreground)"
                  strokeDasharray="4 4"
                  label={{ value: referenceLine.label, position: 'insideTopRight', fontSize: 11, fill: 'var(--muted-foreground)' }}
                />
              )}
              {series.map((s, i) => (
                <Line
                  key={s.key}
                  dataKey={s.key}
                  name={s.label}
                  type={type === 'step' ? 'stepAfter' : 'monotone'}
                  stroke={i === 0 ? 'var(--foreground)' : 'var(--muted-foreground)'}
                  strokeOpacity={i === 0 ? 0.9 : 0.6}
                  strokeWidth={i === 0 ? 2 : 1.5}
                  dot={false}
                  connectNulls
                  {...animation}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
