'use client';

import { TrendBars } from '@/components/viz/TrendBars';
import { CardShell } from './CardPrimitives';

interface ComparisonPeriod {
  period: string;
  value: number | null;
  formatted: string;
}

interface ComparisonRow {
  ticker: string;
  company?: string;
  metric?: string;
  period?: string;
  data?: ComparisonPeriod[];
  error?: string;
}

export interface ComparisonOutput {
  comparison: ComparisonRow[];
}

export function ComparisonResultCard({ output }: { output: ComparisonOutput }) {
  const rows = output.comparison;
  if (!rows || rows.length === 0) return null;

  const metricLabel = rows.find((r) => r.metric)?.metric ?? 'Comparison';

  return (
    <CardShell>
      <div className="mb-2.5 font-semibold text-foreground">{metricLabel}</div>
      <div className="space-y-2.5">
        {rows.map((row) => {
          if (row.error || !row.data || row.data.length === 0) {
            return (
              <div key={row.ticker} className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">{row.ticker}</span>
                <span className="text-[11px] text-muted-foreground">{row.error ?? 'No data'}</span>
              </div>
            );
          }
          // Tool returns periods newest-first; TrendBars expects oldest-to-newest.
          const oldestToNewest = row.data.slice().reverse();
          const latest = row.data[0];
          return (
            <div key={row.ticker}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">
                  {row.ticker}
                  {row.company && row.company !== row.ticker ? ` · ${row.company}` : ''}
                </span>
                <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">{latest.formatted}</span>
              </div>
              <TrendBars
                values={oldestToNewest.map((p) => p.value)}
                height={22}
                signed
                srLabel={`${metricLabel} for ${row.company ?? row.ticker} across ${oldestToNewest.length} periods, latest ${latest.formatted}`}
                className="text-foreground"
              />
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}
