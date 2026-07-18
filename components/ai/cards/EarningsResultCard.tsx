'use client';

import { cn } from '@/lib/utils';
import { CardShell } from './CardPrimitives';

export interface EarningsRow {
  period: string;
  epsActual: string;
  epsEstimate: string;
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
        {rows.map((r) => {
          const beat = r.result === 'Beat';
          const missed = r.result === 'Missed';
          return (
            <div key={r.period} className="flex items-center justify-between gap-2">
              <span className="text-muted-foreground">{r.period}</span>
              <span className="tabular-nums text-foreground">{r.epsActual} vs {r.epsEstimate} est.</span>
              <span
                className={cn(
                  'shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium',
                  beat && 'border-emerald-500/20 bg-emerald-500/10 text-emerald-500',
                  missed && 'border-red-500/20 bg-red-500/10 text-red-500',
                  !beat && !missed && 'border-border/60 bg-muted/40 text-muted-foreground'
                )}
              >
                {r.result}
              </span>
            </div>
          );
        })}
      </div>
    </CardShell>
  );
}
