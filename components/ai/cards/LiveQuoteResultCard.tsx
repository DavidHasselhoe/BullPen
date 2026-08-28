'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { CardShell, StatCell, isNegative } from './CardPrimitives';

export interface LiveQuoteOutput {
  ticker: string;
  price: string;
  change: string;
  changePercent: string;
  priceRaw?: number | null;
  open?: string;
  high?: string;
  low?: string;
}

export function LiveQuoteResultCard({ output }: { output: LiveQuoteOutput }) {
  const { t } = useTranslation('ai');
  const negative = isNegative(output.change);
  const flat = output.change === '0.00';
  const color = flat ? 'text-muted-foreground' : negative ? 'text-red-500' : 'text-emerald-500';
  const Icon = flat ? Minus : negative ? ArrowDownRight : ArrowUpRight;
  return (
    <CardShell>
      <div className="flex items-center justify-between gap-3">
        <Link href={slugToAssetPath(output.ticker)} className="group flex min-w-0 items-center gap-2">
          <CompanyLogo ticker={output.ticker} name={output.ticker} size={28} />
          <div className="min-w-0">
            <div className="font-semibold text-foreground group-hover:underline">{output.ticker}</div>
            <div className="text-lg font-semibold tabular-nums text-foreground">{output.price}</div>
          </div>
        </Link>
        <div className={cn('flex shrink-0 items-center gap-1 text-sm font-medium tabular-nums', color)}>
          <Icon className="h-3.5 w-3.5" />
          {output.changePercent}
        </div>
      </div>
      {(output.open || output.high || output.low) && (
        <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-border/40 pt-2">
          <StatCell label={t('quoteOpenLabel')} value={output.open ?? '—'} />
          <StatCell label={t('quoteHighLabel')} value={output.high ?? '—'} />
          <StatCell label={t('quoteLowLabel')} value={output.low ?? '—'} />
        </div>
      )}
    </CardShell>
  );
}
