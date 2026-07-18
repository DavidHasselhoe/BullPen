'use client';

import { TrendBars } from '@/components/viz/TrendBars';
import { CardShell } from './CardPrimitives';

interface MetricRow {
  period: string;
  periodEnd: string;
  value: number | null;
  formatted: string;
}

export interface CompanyMetricsOutput {
  ticker: string;
  company: string;
  metric: string;
  period: string;
  rows: MetricRow[];
}

export function CompanyMetricsResultCard({ output }: { output: CompanyMetricsOutput }) {
  if (!output.rows || output.rows.length === 0) return null;
  // Tool returns rows newest-first; TrendBars expects oldest-to-newest.
  const oldestToNewest = output.rows.slice().reverse();
  const latest = output.rows[0];

  return (
    <CardShell>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{output.company} · {output.metric}</span>
        <span className="shrink-0 tabular-nums text-[11px] text-muted-foreground">
          {latest.period}: {latest.formatted}
        </span>
      </div>
      <TrendBars
        values={oldestToNewest.map((r) => r.value)}
        height={28}
        signed
        srLabel={`${output.metric} for ${output.company} across ${oldestToNewest.length} periods, latest ${latest.formatted}`}
        className="text-foreground"
      />
    </CardShell>
  );
}
