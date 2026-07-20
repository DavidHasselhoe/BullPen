'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { MetricCard } from '@/components/viz/MetricCard';
import { RangeBar } from '@/components/viz/RangeBar';
import { TermTooltip } from '@/components/ui/TermTooltip';
import type { AssetType } from '@/lib/assets/asset-type';
import type { SignalValue } from '@/lib/finance/health-score';

interface AssetStatsProps {
  ticker: string;
  assetType: AssetType;
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function fmtPrice(n: number | null | undefined): string {
  if (n == null || isNaN(n)) return '—';
  if (n >= 1000) return `$${n.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (n >= 1)    return `$${n.toFixed(2)}`;
  return `$${n.toFixed(6)}`;
}

/** Plain-language placement within the day/24h range. */
function rangeInsight(low: number, high: number, current: number, windowLabel: string): string {
  if (!(high > low) || !current) return `Where the price sits in its ${windowLabel} range`;
  const offHigh = ((high - current) / high) * 100;
  const offLow = ((current - low) / low) * 100;
  if (offHigh <= 2) return `Trading near its ${windowLabel} high`;
  if (offLow <= 2) return `Trading near its ${windowLabel} low`;
  const pos = Math.round(((current - low) / (high - low)) * 100);
  return `About ${pos}% up its ${windowLabel} range`;
}

// /api/stock/[ticker]/quote returns Finnhub-format fields: c, d, dp, h, l, o, pc
interface RawQuote {
  c: number;
  d: number;
  dp: number;
  h: number;
  l: number;
  o: number;
  pc: number;
  t?: number;
}

export function AssetStatsCard({ ticker, assetType }: AssetStatsProps) {
  const { data: quoteData, isLoading } = useQuery<{ success: boolean; quote: RawQuote | null }>({
    queryKey: ['asset-quote', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${encodeURIComponent(ticker)}/quote`);
      return res.json();
    },
    staleTime: 60 * 1000,
    refetchInterval: 60 * 1000,
    enabled: !!ticker,
  });

  const q = quoteData?.quote;

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader className="pb-2"><Skeleton className="h-5 w-32" /></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-[132px] rounded-xl" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  const isCryptoAsset = assetType === 'crypto';
  const windowLabel = isCryptoAsset ? '24h' : 'day';
  const title = isCryptoAsset ? 'Market Data' : assetType === 'commodity' ? 'Commodity Stats' : 'Asset Stats';

  const hasRange = q?.h != null && q?.l != null && q.h > q.l;
  const changeSignal: SignalValue | undefined =
    q?.dp == null ? undefined : q.dp > 0 ? 'positive' : q.dp < 0 ? 'negative' : 'neutral';

  // Secondary values → quiet, glossary-aware rows under the visual cards.
  const rows = [
    { term: 'Open', value: fmtPrice(q?.o) },
    { term: 'Prev Close', value: fmtPrice(q?.pc) },
  ].filter((r) => r.value !== '—');

  return (
    <Card className="mb-8">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {hasRange && (
            <MetricCard
              label={isCryptoAsset ? '24h Range' : 'Day Range'}
              value={fmtPrice(q!.c)}
              insight={rangeInsight(q!.l, q!.h, q!.c, windowLabel)}
            >
              <RangeBar
                low={q!.l}
                high={q!.h}
                current={q!.c}
                format={fmtPrice}
                srLabel={`${windowLabel} range ${fmtPrice(q!.l)} to ${fmtPrice(q!.h)}, currently ${fmtPrice(q!.c)}`}
              />
            </MetricCard>
          )}

          <MetricCard
            label={isCryptoAsset ? 'Change (24h)' : 'Change (Today)'}
            value={fmtPct(q?.dp)}
            signal={changeSignal}
            insight={
              q?.pc != null && q?.c != null
                ? `${q.c >= q.pc ? 'Up' : 'Down'} ${fmtPrice(Math.abs(q.c - q.pc))} since the previous close`
                : undefined
            }
          />
        </div>

        {rows.length > 0 && (
          <div className="mt-4 grid grid-cols-1 gap-x-10 sm:grid-cols-2">
            {rows.map((r) => (
              <div key={r.term} className="flex items-center justify-between gap-2 border-b border-border/50 py-2.5 last:border-0">
                <span className="text-xs text-muted-foreground">
                  <TermTooltip term={r.term} />
                </span>
                <span className="text-xs font-medium tabular-nums text-foreground/80">{r.value}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
