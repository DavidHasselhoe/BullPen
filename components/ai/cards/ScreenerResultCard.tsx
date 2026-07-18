'use client';

import { cn } from '@/lib/utils';
import { CardShell, isNegative } from './CardPrimitives';

interface ScreenerCompany {
  ticker: string;
  name: string;
  sector: string;
  revenue: string;
  grossMargin: string;
  netMargin: string;
  epsDiluted: string;
  freeCashFlow: string;
  revenueGrowth: string;
}

export interface ScreenerOutput {
  count: number;
  companies: ScreenerCompany[];
}

const VISIBLE_ROWS = 5;

function growthColor(growth: string): string {
  if (growth === 'N/A') return 'text-muted-foreground';
  return isNegative(growth) ? 'text-red-500' : 'text-emerald-500';
}

export function ScreenerResultCard({ output }: { output: ScreenerOutput }) {
  if (!output.companies || output.companies.length === 0) return null;
  const visible = output.companies.slice(0, VISIBLE_ROWS);
  const remaining = output.companies.length - visible.length;

  return (
    <CardShell>
      <div className="mb-2 font-semibold text-foreground">{output.count} companies matched</div>
      <div className="space-y-1.5">
        {visible.map((c) => (
          <div key={c.ticker} className="flex items-center justify-between gap-2">
            <div className="min-w-0 truncate">
              <span className="font-medium text-foreground">{c.ticker}</span>
              <span className="ml-1.5 text-[11px] text-muted-foreground">{c.name}</span>
            </div>
            <span className={cn('shrink-0 tabular-nums text-[11px] font-medium', growthColor(c.revenueGrowth))}>
              {c.revenueGrowth} rev growth
            </span>
          </div>
        ))}
      </div>
      {remaining > 0 && <div className="mt-1.5 text-[11px] text-muted-foreground">and {remaining} more</div>}
    </CardShell>
  );
}
