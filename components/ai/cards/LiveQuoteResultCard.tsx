'use client';

import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CardShell, StatCell, isNegative } from './CardPrimitives';

export interface LiveQuoteOutput {
  ticker: string;
  price: string;
  change: string;
  changePercent: string;
  open?: string;
  high?: string;
  low?: string;
}

export function LiveQuoteResultCard({ output }: { output: LiveQuoteOutput }) {
  const negative = isNegative(output.change);
  const flat = output.change === '0.00';
  const color = flat ? 'text-muted-foreground' : negative ? 'text-red-500' : 'text-emerald-500';
  const Icon = flat ? Minus : negative ? ArrowDownRight : ArrowUpRight;
  return (
    <CardShell>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="font-semibold text-foreground">{output.ticker}</div>
          <div className="text-lg font-semibold tabular-nums text-foreground">{output.price}</div>
        </div>
        <div className={cn('flex items-center gap-1 text-sm font-medium tabular-nums', color)}>
          <Icon className="h-3.5 w-3.5" />
          {output.changePercent}
        </div>
      </div>
      {(output.open || output.high || output.low) && (
        <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-border/40 pt-2">
          <StatCell label="Open" value={output.open ?? '—'} />
          <StatCell label="High" value={output.high ?? '—'} />
          <StatCell label="Low" value={output.low ?? '—'} />
        </div>
      )}
    </CardShell>
  );
}
