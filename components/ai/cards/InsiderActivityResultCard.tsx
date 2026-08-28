'use client';

import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('ai');
  if (!output.tradeCount) return null;
  return (
    <CardShell>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="font-semibold text-foreground">{t('insiderActivityTitle', { ticker: output.ticker })}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground">{t('insiderTradeCount', { count: output.tradeCount })}</span>
      </div>
      <FlowBar
        inflow={output.buyValueRaw}
        inLabel={t('insiderBought', { value: output.buyValue })}
        outflow={output.sellValueRaw}
        outLabel={t('insiderSold', { value: output.sellValue })}
        netLabel={t('insiderNet', { value: output.netValue })}
        srLabel={t('insiderSrLabel', { buy: output.buyValue, sell: output.sellValue })}
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
