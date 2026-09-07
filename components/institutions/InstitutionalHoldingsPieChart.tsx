'use client';

/**
 * Donut allocation chart for a fund's top holdings — sits above the full
 * HoldingsTable (which stays the accessible, sortable data-table version of
 * the same numbers; this is a faster-to-scan visual on top of it, not a
 * replacement). Capped at TOP_N slices + one aggregated "Other" wedge so a
 * fund with 50+ positions never renders an unreadable wheel of slivers.
 *
 * Colors reuse the app's existing SECTOR_COLORS categorical palette (see
 * HoldingsPieChart) so both "part of a whole" charts in the product read as
 * the same visual language — "Other" is deliberately neutral gray rather
 * than the next color in the ramp, since it isn't a real single holding.
 */

import { useEffect, useState } from 'react';
import { PieChart as PieChartIcon } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { SECTOR_COLORS } from '@/components/holdings/HoldingsPieChart';
import { fmtUsd } from '@/lib/institutions/format';
import type { DiffableHolding } from '@/lib/institutions/compute-diff';

const TOP_N = 6;
const OTHER_COLOR = 'var(--muted-foreground)';
const OTHER_KEY = '__other__';

interface Slice {
  key: string;
  symbol: string | null;
  name: string;
  value: number;
  pct: number;
  isOther: boolean;
  // recharts' Pie `data` prop is typed as Record<string, unknown>[]
  [key: string]: unknown;
}

function buildSlices(holdings: DiffableHolding[]): { slices: Slice[]; total: number } {
  const total = holdings.reduce((sum, h) => sum + h.valueUsd, 0);
  const sorted = [...holdings].sort((a, b) => b.valueUsd - a.valueUsd);
  const top = sorted.slice(0, TOP_N);
  const rest = sorted.slice(TOP_N);
  const restValue = rest.reduce((sum, h) => sum + h.valueUsd, 0);

  const slices: Slice[] = top.map((h) => ({
    key: h.cusip,
    symbol: h.symbol,
    name: h.nameOfIssuer,
    value: h.valueUsd,
    pct: total > 0 ? (h.valueUsd / total) * 100 : 0,
    isOther: false,
  }));

  if (rest.length > 0) {
    slices.push({
      key: OTHER_KEY,
      symbol: null,
      name: `${rest.length} more position${rest.length === 1 ? '' : 's'}`,
      value: restValue,
      pct: total > 0 ? (restValue / total) * 100 : 0,
      isOther: true,
    });
  }

  return { slices, total };
}

function colorFor(slice: Slice, index: number): string {
  return slice.isOther ? OTHER_COLOR : SECTOR_COLORS[index % SECTOR_COLORS.length];
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
  holdings: DiffableHolding[];
  totalValueUsd?: number | null;
  className?: string;
}

export function InstitutionalHoldingsPieChart({ holdings, totalValueUsd, className }: InstitutionalHoldingsPieChartProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setReducedMotion(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  if (holdings.length === 0) return null;

  const { slices, total } = buildSlices(holdings);
  const centerValue = totalValueUsd ?? total;
  const topSlice = slices[0];

  const ariaLabel = `Portfolio allocation donut chart. Largest holding: ${topSlice.symbol ?? topSlice.name} at ${topSlice.pct.toFixed(1)}% of the portfolio${
    slices.length > 1 ? `, plus ${slices.length - 1} more shown` : ''
  }. Full breakdown in the table below.`;

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <PieChartIcon className="h-4 w-4 text-muted-foreground/80" aria-hidden />
          Top Holdings
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-[220px_1fr] sm:items-center" role="img" aria-label={ariaLabel}>
          <div className="relative mx-auto h-[220px] w-[220px]" aria-hidden>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={68}
                  outerRadius={96}
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
                  {slices.map((s, i) => {
                    const dimmed = hoveredKey !== null && hoveredKey !== s.key;
                    return (
                      <Cell
                        key={s.key}
                        fill={colorFor(s, i)}
                        fillOpacity={s.isOther ? 0.35 : dimmed ? 0.3 : 1}
                        onMouseEnter={() => setHoveredKey(s.key)}
                        onMouseLeave={() => setHoveredKey(null)}
                      />
                    );
                  })}
                </Pie>
                <Tooltip content={<PieTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-lg font-semibold tabular-nums text-foreground">{fmtUsd(centerValue)}</span>
              <span className="text-xs text-muted-foreground/80">Total 13F Value</span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            {slices.map((s, i) => {
              const color = colorFor(s, i);
              const dimmed = hoveredKey !== null && hoveredKey !== s.key;
              return (
                <div
                  key={s.key}
                  className="-mx-1.5 flex items-center gap-2.5 rounded-md px-1.5 py-1 transition-opacity duration-150"
                  style={{ opacity: dimmed ? 0.5 : 1 }}
                  onMouseEnter={() => setHoveredKey(s.key)}
                  onMouseLeave={() => setHoveredKey(null)}
                >
                  {s.symbol ? (
                    <div
                      className="shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-card"
                      style={{ '--tw-ring-color': color } as React.CSSProperties}
                    >
                      <CompanyLogo ticker={s.symbol} name={s.name} size={22} />
                    </div>
                  ) : (
                    <span
                      className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                      style={{ backgroundColor: color }}
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
