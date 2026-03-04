'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import Link from 'next/link';
import { CompanyLogo } from '@/components/company/CompanyLogo';
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

function MoverItem({ mover, isGainer }: { mover: MarketMover; isGainer: boolean }) {
  const Icon = isGainer ? ArrowUpRight : ArrowDownRight;
  const textColor = isGainer ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

  return (
    <Link
      href={`/stock/${mover.symbol}`}
      className="block cursor-pointer hover:bg-accent/50 transition-colors rounded-md p-2 -mx-2"
    >
      <div className="grid grid-cols-[1fr_auto] items-center gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <CompanyLogo
            name={mover.symbol}
            ticker={mover.symbol}
            logoUrl={mover.logoUrl}
            size={32}
            className="rounded overflow-hidden shrink-0"
          />
          <MiniTrendLine isUp={isGainer} className="shrink-0 opacity-70 hidden sm:block" />
          <div className="min-w-0">
            <div className="font-bold text-foreground text-sm tabular-nums tracking-tight truncate">
              {mover.symbol}
            </div>
            <div className="text-xs text-muted-foreground tabular-nums">
              ${mover.price.toFixed(2)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-right shrink-0 min-w-[5rem]">
          <Icon className={`h-4 w-4 ${textColor} shrink-0`} aria-hidden />
          <div className="tabular-nums">
            <div className={`font-semibold text-sm ${textColor}`}>
              {isGainer ? '+' : ''}{mover.changePercent.toFixed(2)}%
            </div>
            <div className={`text-xs ${textColor}`}>
              {isGainer ? '+' : ''}${mover.change.toFixed(2)}
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
}

export function TopMoversCard({ gainers, losers, isLoading }: TopMoversCardProps) {
  if (isLoading) {
    return (
      <Card className="border-border/50">
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
    <Card className="border-border/50">
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
          <div className="space-y-1">
            {gainers.length > 0 ? (
              gainers.map((mover) => (
                <MoverItem key={mover.symbol} mover={mover} isGainer={true} />
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
          <div className="space-y-1">
            {losers.length > 0 ? (
              losers.map((mover) => (
                <MoverItem key={mover.symbol} mover={mover} isGainer={false} />
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