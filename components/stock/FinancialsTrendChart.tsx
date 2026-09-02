'use client';

/**
 * FinancialsTrendChart — the chart-first lead for the Financials section.
 *
 * One paired-bar chart per statement tab, answering a single question
 * (captioned) with up to 5 periods, newest → oldest — matching the
 * period columns in the detailed table directly below it, left to right.
 */

import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { useTranslation } from 'react-i18next';

const EMERALD = '#10b981';
const RED = '#ef4444';

export interface TrendPoint {
  label: string;
  primary: number | null;
  secondary?: number | null;
}

type ColorMode =
  /** Both series neutral grayscale — the default when neither series has an inherent signal. */
  | 'neutral'
  /** Primary stays neutral; secondary is colored per-period by its own sign (profit/loss, net cash flow). */
  | 'signSecondary'
  /** Both series colored as a fixed pair — primary = what's owned/coming in (emerald), secondary = what's
   *  owed/going out (red). Not a per-period sign flip like signSecondary; a standing own-vs-owe contrast. */
  | 'ownVsOwe';

interface FinancialsTrendChartProps {
  /** Newest → oldest, matching the table below. */
  points: TrendPoint[];
  primaryLabel: string;
  secondaryLabel?: string;
  /** The beginner question this chart answers, e.g. "Is the company growing — and keeping profit?" */
  question: string;
  format: (v: number) => string;
  colorMode?: ColorMode;
}

export function FinancialsTrendChart({
  points,
  primaryLabel,
  secondaryLabel,
  question,
  format,
  colorMode = 'neutral',
}: FinancialsTrendChartProps) {
  const { t } = useTranslation('stock');
  const hasData = points.some((p) => p.primary != null || p.secondary != null);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  if (!hasData) return null;

  const primaryColor = colorMode === 'ownVsOwe' ? EMERALD : 'var(--foreground)';
  const primaryOpacity = colorMode === 'ownVsOwe' ? 0.7 : 0.45;
  const secondarySwatchColor =
    colorMode === 'ownVsOwe' ? RED : colorMode === 'signSecondary' ? EMERALD : 'var(--muted-foreground)';
  const animation = { isAnimationActive: !reducedMotion, animationDuration: 450, animationEasing: 'ease-out' as const };
  const secondaryPart = secondaryLabel ? t('financialsTrendChartAriaSecondaryPart', { secondaryLabel }) : '';
  const ariaLabel = t('financialsTrendChartAriaLabel', {
    question,
    primaryLabel,
    secondaryPart,
    count: points.length,
  });

  return (
    <div className="mb-5" role="img" aria-label={ariaLabel}>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-medium text-foreground/80">{question}</p>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: primaryColor, opacity: primaryOpacity }} aria-hidden />
            {primaryLabel}
          </span>
          {secondaryLabel && (
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-[2px]" style={{ backgroundColor: secondarySwatchColor }} aria-hidden />
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
              labelStyle={{ color: 'var(--muted-foreground)' }}
              itemStyle={{ color: 'var(--popover-foreground)' }}
              formatter={(value: number | string, name: string) => [format(Number(value)), name]}
            />
            <Bar
              dataKey="primary"
              name={primaryLabel}
              fill={primaryColor}
              fillOpacity={primaryOpacity}
              radius={[3, 3, 0, 0]}
              activeBar={{ fillOpacity: Math.min(1, primaryOpacity + 0.3) }}
              {...animation}
            />
            {secondaryLabel && (
              <Bar
                dataKey="secondary"
                name={secondaryLabel}
                radius={[3, 3, 0, 0]}
                activeBar={{ fillOpacity: 1 }}
                {...animation}
              >
                {points.map((p, i) => {
                  const fill =
                    colorMode === 'signSecondary'
                      ? (p.secondary ?? 0) < 0 ? RED : EMERALD
                      : colorMode === 'ownVsOwe'
                        ? RED
                        : 'var(--muted-foreground)';
                  const fillOpacity = colorMode === 'neutral' ? 0.5 : colorMode === 'ownVsOwe' ? 0.7 : 0.85;
                  return <Cell key={i} fill={fill} fillOpacity={fillOpacity} />;
                })}
              </Bar>
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
