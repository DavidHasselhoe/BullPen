'use client';

/**
 * FinancialsTrendChart — the chart-first lead for the Financials section.
 *
 * One paired-bar chart per statement tab, answering a single question
 * (captioned) with up to 5 periods, oldest → newest. Secondary series can be
 * sign-colored (net income / FCF: emerald when positive, red when negative,
 * always alongside the tabular numbers in the table below).
 */

import { BarChart, Bar, XAxis, Cell, ResponsiveContainer, Tooltip } from 'recharts';

const EMERALD = '#10b981';
const RED = '#ef4444';

export interface TrendPoint {
  label: string;
  primary: number | null;
  secondary?: number | null;
}

interface FinancialsTrendChartProps {
  /** Oldest → newest. */
  points: TrendPoint[];
  primaryLabel: string;
  secondaryLabel?: string;
  /** The beginner question this chart answers, e.g. "Is the company growing — and keeping profit?" */
  question: string;
  format: (v: number) => string;
  /** Color the secondary bars by sign (profit/loss). Default false → neutral. */
  signColorSecondary?: boolean;
}

export function FinancialsTrendChart({
  points,
  primaryLabel,
  secondaryLabel,
  question,
  format,
  signColorSecondary = false,
}: FinancialsTrendChartProps) {
  const hasData = points.some((p) => p.primary != null || p.secondary != null);
  if (!hasData) return null;

  return (
    <div className="mb-5" role="img" aria-label={`${question} Chart of ${primaryLabel}${secondaryLabel ? ` and ${secondaryLabel}` : ''} across ${points.length} periods.`}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-foreground/80">{question}</p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px] bg-foreground/45" aria-hidden />
            {primaryLabel}
          </span>
          {secondaryLabel && (
            <span className="flex items-center gap-1.5">
              <span
                className="h-2 w-2 rounded-[2px]"
                style={{ backgroundColor: signColorSecondary ? EMERALD : 'var(--muted-foreground)' }}
                aria-hidden
              />
              {secondaryLabel}
            </span>
          )}
        </div>
      </div>
      <div className="h-[180px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={points} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barGap={2}>
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
              interval="preserveStartEnd"
            />
            <Tooltip
              cursor={{ fill: 'var(--muted)', opacity: 0.4 }}
              contentStyle={{
                background: 'var(--popover)',
                border: '1px solid var(--border)',
                borderRadius: 10,
                fontSize: 12,
              }}
              formatter={(value: number | string, name: string) => [format(Number(value)), name]}
            />
            <Bar dataKey="primary" name={primaryLabel} fill="var(--foreground)" fillOpacity={0.45} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            {secondaryLabel && (
              <Bar dataKey="secondary" name={secondaryLabel} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                {points.map((p, i) => (
                  <Cell
                    key={i}
                    fill={
                      signColorSecondary
                        ? (p.secondary ?? 0) < 0 ? RED : EMERALD
                        : 'var(--muted-foreground)'
                    }
                    fillOpacity={signColorSecondary ? 0.85 : 0.5}
                  />
                ))}
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
