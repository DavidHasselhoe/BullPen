'use client';

import { DeltaBar } from '@/components/viz/DeltaBar';
import { CardShell } from './CardPrimitives';

export interface EarningsRow {
  period: string;
  epsActual: string;
  epsEstimate: string;
  epsActualRaw?: number | null;
  epsEstimateRaw?: number | null;
  result: string;
  surprise: string;
}

export function EarningsResultCard({ output }: { output: EarningsRow[] }) {
  const rows = output.slice(0, 4);
  if (rows.length === 0) return null;
  return (
    <CardShell>
      <div className="mb-2 font-semibold text-foreground">Earnings history</div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.period} className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">{r.period}</span>
            <DeltaBar
              estimate={r.epsEstimateRaw ?? null}
              actual={r.epsActualRaw ?? null}
              srLabel={
                r.epsActualRaw != null && r.epsEstimateRaw != null
                  ? `Earned $${r.epsActualRaw.toFixed(2)} per share vs $${r.epsEstimateRaw.toFixed(2)} expected (${r.surprise} surprise)`
                  : `Estimate $${r.epsEstimateRaw?.toFixed(2) ?? '—'} per share`
              }
            />
          </div>
        ))}
      </div>
    </CardShell>
  );
}
