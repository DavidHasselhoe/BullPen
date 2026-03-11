'use client';

import { useMemo, useState } from 'react';
import { pie as d3Pie, arc as d3Arc } from 'd3';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart } from 'lucide-react';
import { formatCurrency, type CurrencyCode } from '@/lib/currency/currency-conversion';
import type { HoldingWithPrice } from './types';

interface HoldingsPieChartProps {
  holdings: HoldingWithPrice[];
  currency?: CurrencyCode;
}

interface ChartData {
  name: string;
  companyName: string;
  value: number;
  allocation: number;
}

// Refined, professional color palette
const COLORS = [
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#06b6d4', // cyan-500
  '#f59e0b', // amber-500
  '#10b981', // emerald-500
  '#f43f5e', // rose-500
  '#a78bfa', // violet-400
  '#34d399', // emerald-400
  '#fb923c', // orange-400
  '#60a5fa', // blue-400
];

const VIEW_W = 240;
const VIEW_H = 240;
const CX = VIEW_W / 2;
const CY = VIEW_H / 2;
const OUTER_R = 100;
const INNER_R = 62;
const HOVER_OUTER_R = OUTER_R + 9;

export function HoldingsPieChart({ holdings, currency = 'USD' }: HoldingsPieChartProps) {
  // Compact currency formatter (e.g. NOK 3.8K, $21.4M)
  function fmtValue(value: number): string {
    const formatted = formatCurrency(value, currency);
    // Detect the symbol/prefix so we can apply compact notation
    const absVal = Math.abs(value);
    if (absVal >= 1_000_000) {
      const compact = (value / 1_000_000).toFixed(1);
      // Replace the numeric part with compact version
      return formatted.replace(/[\d,]+(\.\d+)?/, compact + 'M');
    }
    if (absVal >= 1_000) {
      const compact = (value / 1_000).toFixed(1);
      return formatted.replace(/[\d,]+(\.\d+)?/, compact + 'K');
    }
    return formatCurrency(value, currency);
  }
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  const { chartData, totalValue } = useMemo(() => {
    const total = holdings.reduce((sum, h) => sum + (h.marketValue ?? 0), 0);

    if (total === 0) {
      // Fallback: equal weights when no market value available
      const equalAlloc = 100 / holdings.length;
      return {
        chartData: holdings.map((h) => ({
          name: h.symbol,
          companyName: h.company_name,
          value: 1,
          allocation: equalAlloc,
        })),
        totalValue: 0,
      };
    }

    const data: ChartData[] = holdings
      .filter((h) => (h.marketValue ?? 0) > 0)
      .map((h) => ({
        name: h.symbol,
        companyName: h.company_name,
        value: h.marketValue!,
        allocation: (h.marketValue! / total) * 100,
      }))
      .sort((a, b) => b.value - a.value);

    return { chartData: data, totalValue: total };
  }, [holdings]);

  const arcs = useMemo(() => {
    const pieGen = d3Pie<ChartData>()
      .value((d) => d.value)
      .sort(null)
      .padAngle(0.025);
    return pieGen(chartData);
  }, [chartData]);

  const arcGen = useMemo(
    () =>
      d3Arc<ReturnType<typeof d3Pie<ChartData>>[number]>()
        .innerRadius(INNER_R)
        .outerRadius(OUTER_R)
        .cornerRadius(3),
    []
  );

  const arcGenHover = useMemo(
    () =>
      d3Arc<ReturnType<typeof d3Pie<ChartData>>[number]>()
        .innerRadius(INNER_R)
        .outerRadius(HOVER_OUTER_R)
        .cornerRadius(3),
    []
  );

  if (chartData.length === 0) return null;

  const hoveredData = hoveredIndex !== null ? chartData[hoveredIndex] : null;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PieChart className="h-5 w-5 text-primary" />
          Portfolio Allocation
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6 md:gap-10">
          {/* Donut */}
          <div className="shrink-0 relative">
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              width={VIEW_W}
              height={VIEW_H}
              className="overflow-visible"
            >
              <g transform={`translate(${CX}, ${CY})`}>
                {arcs.map((arc, i) => {
                  const isHovered = hoveredIndex === i;
                  const isOtherHovered = hoveredIndex !== null && !isHovered;
                  const pathD = (isHovered ? arcGenHover : arcGen)(arc) ?? '';

                  return (
                    <path
                      key={chartData[i].name}
                      d={pathD}
                      fill={COLORS[i % COLORS.length]}
                      style={{
                        opacity: isOtherHovered ? 0.35 : 1,
                        transition: 'opacity 0.18s ease, d 0.18s ease',
                        cursor: 'pointer',
                      }}
                      onMouseEnter={() => setHoveredIndex(i)}
                      onMouseLeave={() => setHoveredIndex(null)}
                    />
                  );
                })}

                {/* Center label */}
                {hoveredData ? (
                  <>
                    <text
                      textAnchor="middle"
                      dy="-0.5em"
                      className="fill-foreground font-bold text-sm"
                      style={{ fontSize: 13, fontWeight: 700 }}
                    >
                      {hoveredData.name}
                    </text>
                    <text
                      textAnchor="middle"
                      dy="1em"
                      style={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                    >
                      {hoveredData.allocation.toFixed(1)}%
                    </text>
                    {totalValue > 0 && (
                      <text
                        textAnchor="middle"
                        dy="2.4em"
                        style={{ fontSize: 11 }}
                        className="fill-muted-foreground"
                      >
                        {fmtValue(hoveredData.value)}
                      </text>
                    )}
                  </>
                ) : (
                  <>
                    {totalValue > 0 && (
                      <text
                        textAnchor="middle"
                        dy="-0.4em"
                        style={{ fontSize: 13, fontWeight: 700 }}
                        className="fill-foreground"
                      >
                        {fmtValue(totalValue)}
                      </text>
                    )}
                    <text
                      textAnchor="middle"
                      dy="1.1em"
                      style={{ fontSize: 11 }}
                      className="fill-muted-foreground"
                    >
                      Portfolio
                    </text>
                  </>
                )}
              </g>
            </svg>
          </div>

          {/* Legend */}
          <div className="flex-1 w-full min-w-0 self-center divide-y divide-border/30">
            {chartData.map((d, i) => {
              const isHovered = hoveredIndex === i;
              const isOtherHovered = hoveredIndex !== null && !isHovered;

              return (
                <div
                  key={d.name}
                  className="flex items-center gap-3 py-2.5 px-2 rounded-lg cursor-pointer hover:bg-muted/40 transition-colors"
                  style={{ opacity: isOtherHovered ? 0.4 : 1, transition: 'opacity 0.18s ease' }}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                >
                  {/* Color dot */}
                  <span
                    className="shrink-0 h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: COLORS[i % COLORS.length] }}
                  />

                  {/* Ticker + company name stacked */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-semibold text-sm text-foreground shrink-0">{d.name}</span>
                        <span className="text-xs text-muted-foreground truncate">{d.companyName}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-sm font-semibold text-foreground tabular-nums">
                          {d.allocation.toFixed(1)}%
                        </span>
                        {totalValue > 0 && (
                          <span className="text-xs text-muted-foreground tabular-nums w-14 text-right">
                            {fmtValue(d.value)}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Allocation bar */}
                    <div className="mt-1.5 h-1 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${d.allocation}%`,
                          backgroundColor: COLORS[i % COLORS.length],
                          opacity: 0.75,
                        }}
                      />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
