'use client';

import { cn } from '@/lib/utils';
import { FlowBar } from '@/components/viz/FlowBar';
import { CardShell } from './CardPrimitives';

interface InsiderTopTransaction {
  name: string;
  position: string;
  type: 'buy' | 'sell' | 'other';
  value: string;
  date: string;
}

export interface InsiderActivityOutput {
  ticker: string;
  buyValue: string;
  sellValue: string;
  netValue: string;
  buyValueRaw: number;
  sellValueRaw: number;
  netValueRaw: number;
  tradeCount: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
  topTransactions: InsiderTopTransaction[];
}

export function InsiderActivityResultCard({ output }: { output: InsiderActivityOutput }) {
  if (!output.tradeCount) return null;
  return (
    <CardShell>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{output.ticker} Insider Activity</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{output.tradeCount} trades</span>
      </div>
      <FlowBar
        inflow={output.buyValueRaw}
        inLabel={`Bought ${output.buyValue}`}
        outflow={output.sellValueRaw}
        outLabel={`Sold ${output.sellValue}`}
        netLabel={`Net ${output.netValue}`}
        srLabel={`Insiders bought ${output.buyValue} and sold ${output.sellValue}`}
      />
      {output.topTransactions.length > 0 && (
        <div className="mt-2.5 space-y-1 border-t border-border/40 pt-2">
          {output.topTransactions.map((t, i) => (
            <div key={i} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="truncate text-muted-foreground">{t.name} · {t.position}</span>
              <span
                className={cn(
                  'shrink-0 tabular-nums font-medium',
                  t.type === 'buy' ? 'text-emerald-500' : t.type === 'sell' ? 'text-red-500' : 'text-muted-foreground'
                )}
              >
                {t.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </CardShell>
  );
}
