'use client';

/**
 * Donut allocation chart for a fund's top holdings, and the lead visual on the
 * fund detail page — the holdings bar list below it is the same data read a
 * second way, sharing one color per ticker via buildAllocation().
 *
 * Capped at ALLOCATION_TOP_N wedges plus one aggregated "Other", so a fund
 * with thousands of positions never renders an unreadable wheel of slivers.
 * "Other" is neutral gray rather than the next color in the ramp, since it
 * isn't a single holding competing for identity with the named ones.
 */

import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { ALLOCATION_OTHER_COLOR } from '@/lib/charts/allocation-colors';
import { allocationHeadline } from '@/lib/institutions/allocation';
import { fmtUsd } from '@/lib/institutions/format';
import type { Allocation } from '@/lib/institutions/allocation';

const OTHER_KEY = '__other__';

interface Slice {
  key: string;
  symbol: string | null;
  name: string;
  value: number;
  pct: number;
  color: string;
  isOther: boolean;
  // recharts' Pie `data` prop is typed as Record<string, unknown>[]
  [key: string]: unknown;
}

function toSlices(allocation: Allocation): Slice[] {
  const slices: Slice[] = allocation.top.map((h) => ({
    key: h.key,
    symbol: h.symbol,
    name: h.name,
    value: h.valueUsd,
    pct: h.pct,
    color: h.color,
    isOther: false,
  }));

  if (allocation.rest.length > 0) {
    slices.push({
      key: OTHER_KEY,
      symbol: null,
      name: `${allocation.rest.length.toLocaleString()} more position${allocation.rest.length === 1 ? '' : 's'}`,
      value: allocation.restValue,
      pct: allocation.restPct,
      color: ALLOCATION_OTHER_COLOR,
      isOther: true,
    });
  }

  return slices;
}

function PieTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Slice }> }) {
  if (!active || !payload?.length) return null;
  const s = payload[0].payload;
  return (
    <div
      className="rounded-[10px] border px-3 py-2 text-xs"
      style={{ background: 'var(--popover)', borderColor: 'var(--border)' }}
    >
      <p className="mb-0.5 font-semibold text-popover-foreground">{s.symbol ?? s.name}</p>
      {s.symbol && <p className="mb-1 text-muted-foreground">{s.name}</p>}
      <p className="font-mono tabular-nums text-popover-foreground">
        {fmtUsd(s.value)} &middot; {s.pct.toFixed(1)}%
      </p>
    </div>
  );
}

interface InstitutionalHoldingsPieChartProps {
  allocation: Allocation;
  totalValueUsd?: number | null;
  /** Ticker currently hovered anywhere on the page, so the donut and the bar
   *  list below highlight the same holding together. */
  highlightedKey: string | null;
  onHighlight: (key: string | null) => void;
  className?: string;
}

export function InstitutionalHoldingsPieChart({
  allocation,
  totalValueUsd,
  highlightedKey,
  onHighlight,
  className,
}: InstitutionalHoldingsPieChartProps) {
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  if (allocation.top.length === 0) return null;

  const slices = toSlices(allocation);
  const centerValue = totalValueUsd ?? allocation.total;
  const headline = allocationHeadline(allocation);
  const topSlice = slices[0];

  const ariaLabel = `Portfolio allocation. Largest holding: ${topSlice.symbol ?? topSlice.name} at ${topSlice.pct.toFixed(1)}% of the portfolio${
    slices.length > 1 ? `, plus ${slices.length - 1} more shown` : ''
  }. Full breakdown in the list below.`;

  return (
    <Card className={className}>
      <CardContent className="pt-6">
        {headline && (
          <p className="mb-6 max-w-prose text-base leading-snug text-foreground/90">{headline}</p>
        )}

        <div
          className="grid grid-cols-1 gap-8 sm:grid-cols-[280px_1fr] sm:items-center"
          role="img"
          aria-label={ariaLabel}
        >
          <div className="relative mx-auto h-[280px] w-[280px]" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={86}
                  outerRadius={126}
                  paddingAngle={2}
                  cornerRadius={4}
                  startAngle={90}
                  endAngle={-270}
                  stroke="var(--card)"
                  strokeWidth={2}
                  isAnimationActive={!reducedMotion}
                  animationDuration={450}
                  animationEasing="ease-out"
                >
                  {slices.map((s) => {
                    const dimmed = highlightedKey !== null && highlightedKey !== s.key;
                    return (
                      <Cell
                        key={s.key}
                        fill={s.color}
                        fillOpacity={s.isOther ? 0.35 : dimmed ? 0.3 : 1}
                        onMouseEnter={() => onHighlight(s.key)}
                        onMouseLeave={() => onHighlight(null)}
                      />
                    );
                  })}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                {fmtUsd(centerValue)}
              </span>
              <span className="mt-0.5 text-xs text-muted-foreground/80">Total 13F Value</span>
            </div>
          </div>

          {/* Two columns on wide screens: one tall column leaves a ticker and
              its percentage separated by most of the card, which is a long way
              for the eye to travel to read one row. */}
          <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 lg:grid-cols-2">
            {slices.map((s) => {
              const dimmed = highlightedKey !== null && highlightedKey !== s.key;
              return (
                <div
                  key={s.key}
                  className="-mx-1.5 flex items-center gap-2.5 rounded-md px-1.5 py-1 transition-opacity duration-150"
                  style={{ opacity: dimmed ? 0.5 : 1 }}
                  onMouseEnter={() => onHighlight(s.key)}
                  onMouseLeave={() => onHighlight(null)}
                >
                  {s.symbol ? (
                    <div
                      className="shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-card"
                      style={{ '--tw-ring-color': s.color } as React.CSSProperties}
                    >
                      <CompanyLogo ticker={s.symbol} name={s.name} size={22} />
                    </div>
                  ) : (
                    <span
                      className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: s.color }}
                    >
                      &hellip;
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground/85">
                    {s.symbol ?? s.name}
                  </span>
                  <span className="shrink-0 font-mono text-sm tabular-nums text-foreground">
                    {s.pct.toFixed(1)}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
