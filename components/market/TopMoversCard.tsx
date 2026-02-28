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

function MoverItem({ mover, isGainer }: { mover: MarketMover; isGainer: boolean }) {
  const Icon = isGainer ? ArrowUpRight : ArrowDownRight;
  const textColor = isGainer ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';

  return (
    <Link 
      href={`/stock/${mover.symbol}`}
      className="block hover:bg-accent/50 transition-colors rounded-md p-2 -mx-2"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <CompanyLogo
            name={mover.symbol}
            ticker={mover.symbol}
            size={36}
            className="rounded overflow-hidden"
          />
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-foreground truncate">{mover.symbol}</div>
            <div className="text-sm text-muted-foreground">
              ${mover.price.toFixed(2)}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-right shrink-0">
          <Icon className={`h-4 w-4 ${textColor}`} aria-hidden />
          <div>
            <div className={`font-semibold ${textColor}`}>
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