'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { AssetType } from '@/lib/assets/asset-type';

interface AssetStatsProps {
  ticker: string;
  assetType: AssetType;
}

interface StatsRow {
  label: string;
  value: string;
}

function StatRow({ label, value }: StatsRow) {
  return (
    <div className="flex items-center justify-between py-2 border-b last:border-0 border-border/40">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium tabular-nums">{value}</span>
    </div>
  );
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
    staleTime: 30 * 1000,
    refetchInterval: 60 * 1000,
    enabled: !!ticker,
  });

  const q = quoteData?.quote;

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader><Skeleton className="h-5 w-32" /></CardHeader>
        <CardContent>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex justify-between py-2 border-b border-border/40">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  const isCryptoAsset = assetType === 'crypto';

  const rows: StatsRow[] = [
    { label: 'Price',                                    value: fmtPrice(q?.c) },
    { label: 'Change (24h)',                             value: fmtPct(q?.dp) },
    { label: isCryptoAsset ? '24h High' : 'Day High',   value: fmtPrice(q?.h) },
    { label: isCryptoAsset ? '24h Low'  : 'Day Low',    value: fmtPrice(q?.l) },
    { label: 'Open',                                     value: fmtPrice(q?.o) },
    { label: 'Prev. Close',                              value: fmtPrice(q?.pc) },
  ];

  const title = isCryptoAsset ? 'Market Data' : assetType === 'commodity' ? 'Commodity Stats' : 'Asset Stats';

  return (
    <Card className="mb-8">
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.map((r) => (
          <StatRow key={r.label} label={r.label} value={r.value} />
        ))}
      </CardContent>
    </Card>
  );
}
