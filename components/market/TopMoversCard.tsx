'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { CompanyRowActions } from '@/components/discover/CompanyRowActions';
import { cn } from '@/lib/utils';
import type { MarketMover } from '@/lib/finnhub/finnhub-client';

interface TopMoversCardProps {
  gainers: MarketMover[];
  losers: MarketMover[];
  isLoading?: boolean;
}

/** Minimal SVG trend line (direction indicator; not real price data) */
function MiniTrendLine({ isUp, className }: { isUp: boolean; className?: string }) {
  const path = isUp
    ? 'M 2 12 L 6 8 L 10 10 L 14 4'
    : 'M 2 4 L 6 8 L 10 6 L 14 12';
  const stroke = isUp ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)'; // green-500 / red-500
  return (
    <svg
      viewBox="0 0 16 16"
      className={className}
      width={32}
      height={24}
      fill="none"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={path} stroke={stroke} />
    </svg>
  );
}

function MoverItem({
  mover,
  isGainer,
  companyName,
}: {
  mover: MarketMover;
  isGainer: boolean;
  companyName?: string;
}) {
  const textColor = isGainer ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  const fullName = companyName || mover.symbol;
  const hasFullName = !!companyName && companyName !== mover.symbol;

  return (
    <div className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg p-2.5 -mx-2 transition-all duration-200 hover:bg-accent/50 hover:shadow-sm border border-transparent hover:border-border/50">
      <Link href={`/stock/${mover.symbol}`} className="contents">
        <div className="flex items-center gap-2 shrink-0">
          <CompanyLogo
            name={companyName || mover.symbol}
            ticker={mover.symbol}
            logoUrl={mover.logoUrl}
            size={32}
            className="rounded overflow-hidden shrink-0"
          />
          <MiniTrendLine isUp={isGainer} className="shrink-0 opacity-70 hidden sm:block" />
        </div>
        <div className="min-w-0 overflow-hidden flex flex-col justify-center relative">
          {/* Default: full company name (uses all space when actions are collapsed) */}
          <div className="font-extrabold text-foreground text-sm tracking-tight overflow-hidden">
            <span
              className={cn(
                'block truncate transition-all duration-200 ease-out',
                hasFullName
                  ? 'opacity-100 translate-x-0 group-hover:opacity-0 group-hover:-translate-x-1'
                  : ''
              )}
              title={fullName}
            >
              {fullName}
            </span>
            {/* Hover: ticker slides in from right, aligned with name position */}
            {hasFullName && (
              <span
                className="absolute left-0 top-0 opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 ease-out tabular-nums"
                title={fullName}
              >
                {mover.symbol}
              </span>
            )}
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            ${mover.price.toFixed(2)}
          </div>
        </div>
      </Link>
      <div className="flex items-center gap-2 shrink-0">
        <div className={`text-right tabular-nums ${textColor}`}>
          <div className="font-semibold text-sm">
            {isGainer ? '+' : ''}{mover.changePercent.toFixed(2)}%
          </div>
          <div className="text-xs">
            {isGainer ? '+' : ''}${mover.change.toFixed(2)}
          </div>
        </div>
        {/* Actions collapse to 0 width when not hovered, freeing space for full name */}
        <div className="max-w-0 overflow-hidden opacity-0 group-hover:max-w-[88px] group-hover:opacity-100 transition-all duration-200 ease-out flex items-center">
          <CompanyRowActions ticker={mover.symbol} name={companyName || mover.symbol} />
        </div>
      </div>
    </div>
  );
}

export function TopMoversCard({ gainers, losers, isLoading }: TopMoversCardProps) {
  const allTickers = [...(gainers || []), ...(losers || [])].map((m) => m.symbol);
  const { data: companyBatch } = useQuery({
    queryKey: ['companies-batch', allTickers],
    queryFn: async () => {
      if (allTickers.length === 0) return [];
      const res = await fetch('/api/companies/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: allTickers }),
      });
      const json = await res.json();
      return (json.data || []) as Array<{ ticker: string; name: string; logo_url: string | null }>;
    },
    enabled: allTickers.length > 0 && !isLoading,
    staleTime: 5 * 60 * 1000,
  });

  const companyNameMap = new Map(
    (companyBatch || []).map((c) => [c.ticker, c.name])
  );

  if (isLoading) {
    return (
      <Card className="border-border/50 min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle>Top Market Movers</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
              <h3 className="text-sm font-semibold text-foreground">Top Gainers</h3>
            </div>
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
              <h3 className="text-sm font-semibold text-foreground">Top Losers</h3>
            </div>
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 min-w-0 overflow-hidden">
      <CardHeader>
        <CardTitle>Top Market Movers</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Top Gainers */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="h-4 w-4 text-green-600 dark:text-green-400" />
            <h3 className="text-sm font-semibold text-foreground">Top Gainers</h3>
          </div>
          <div className="space-y-1.5">
            {gainers.length > 0 ? (
              gainers.map((mover) => (
                <MoverItem
                  key={mover.symbol}
                  mover={mover}
                  isGainer={true}
                  companyName={companyNameMap.get(mover.symbol)}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No data available
              </p>
            )}
          </div>
        </div>

        {/* Top Losers */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="h-4 w-4 text-red-600 dark:text-red-400" />
            <h3 className="text-sm font-semibold text-foreground">Top Losers</h3>
          </div>
          <div className="space-y-1.5">
            {losers.length > 0 ? (
              losers.map((mover) => (
                <MoverItem
                  key={mover.symbol}
                  mover={mover}
                  isGainer={false}
                  companyName={companyNameMap.get(mover.symbol)}
                />
              ))
            ) : (
              <p className="text-sm text-muted-foreground py-4 text-center">
                No data available
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}