'use client';

import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { LayoutGrid } from 'lucide-react';
import type { HoldingWithPrice } from './types';
import type { CurrencyCode } from '@/lib/currency/currency-conversion';

interface HoldingsPieChartProps {
  holdings: HoldingWithPrice[];
  currency?: CurrencyCode;
  onSectorHover?: (sector: string | null) => void;
}

const SECTOR_COLORS = [
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#10b981', // emerald
  '#a78bfa', // violet
  '#6366f1', // indigo
  '#fbbf24', // yellow
  '#8b5cf6', // purple
  '#94a3b8', // slate
  '#34d399', // teal
];

function shortenSector(sector: string): string {
  return sector
    .replace('Consumer Discretionary', 'Cons. Disc.')
    .replace('Consumer Staples', 'Cons. Staples')
    .replace('Communication Services', 'Comm. Services')
    .replace('Information Technology', 'Tech');
}

/** Canonical sector label for a holding — must match what the pie chart buckets use. */
export function getSectorLabel(h: Pick<HoldingWithPrice, 'asset_type' | 'sector'>): string {
  if (h.asset_type === 'crypto') return 'Crypto';
  if (h.asset_type === 'commodity') return 'Commodities';
  if (h.asset_type === 'etf') return shortenSector(h.sector ?? 'ETF');
  return shortenSector(h.sector ?? 'Other');
}

export function HoldingsPieChart({ holdings, onSectorHover }: HoldingsPieChartProps) {
  const sectors = useMemo(() => {
    const totalValue = holdings.reduce((sum, h) => sum + (h.marketValue ?? 0), 0);
    if (totalValue === 0) return [];

    const buckets: Record<string, number> = {};
    for (const h of holdings) {
      if (!h.marketValue) continue;
      const label = getSectorLabel(h);
      buckets[label] = (buckets[label] ?? 0) + h.marketValue;
    }

    return Object.entries(buckets)
      .map(([name, value]) => ({ name, allocation: (value / totalValue) * 100 }))
      .sort((a, b) => b.allocation - a.allocation);
  }, [holdings]);

  if (sectors.length === 0) return null;

  return (
    <Card className="border-border/50 h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <LayoutGrid className="h-4 w-4 text-muted-foreground/60" />
          Allocation
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {sectors.map((sector, i) => (
            <div
              key={sector.name}
              onMouseEnter={() => onSectorHover?.(sector.name)}
              onMouseLeave={() => onSectorHover?.(null)}
              className="cursor-default"
            >
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span
                    className="h-2 w-2 rounded-full shrink-0"
                    style={{ backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] }}
                  />
                  <span className="text-sm text-foreground/85 truncate">{sector.name}</span>
                </div>
                <span className="text-sm font-semibold tabular-nums text-foreground shrink-0 ml-3">
                  {sector.allocation.toFixed(1)}%
                </span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted/60 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${sector.allocation}%`,
                    backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length],
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
