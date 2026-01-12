'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown } from 'lucide-react';
import { useStockQuote } from '@/hooks/use-stock-price';
import type { StockQuote } from '@/lib/finnhub/finnhub-client';

interface StockQuoteCardProps {
  ticker: string;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPercent(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

export function StockQuoteCard({ ticker }: StockQuoteCardProps) {
  const { data: quote, isLoading, error } = useStockQuote(ticker);

  if (isLoading) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Stock Price</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-12 w-32" />
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-24" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-24" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-24" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !quote || quote.c === 0) {
    return (
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle>Stock Price</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Price data not available
          </p>
        </CardContent>
      </Card>
    );
  }

  const isPositive = quote.dp >= 0;
  const colorClass = isPositive
    ? 'text-green-600 dark:text-green-400'
    : 'text-red-600 dark:text-red-400';
  const bgColor = isPositive
    ? 'bg-green-50 dark:bg-green-950/20'
    : 'bg-red-50 dark:bg-red-950/20';
  const Icon = isPositive ? ArrowUpRight : ArrowDownRight;
  const TrendIcon = isPositive ? TrendingUp : TrendingDown;

  return (
    <Card className="border-border/50">
      <CardHeader>
        <CardTitle>Stock Price</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Price and Change */}
        <div className="space-y-2">
          <div className="flex items-baseline gap-3">
            <span className="text-4xl font-bold text-foreground">
              {formatCurrency(quote.c)}
            </span>
            <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md ${bgColor}`}>
              <Icon className={`h-4 w-4 ${colorClass}`} />
              <span className={`font-semibold ${colorClass}`}>
                {formatPercent(quote.dp)}
              </span>
            </div>
          </div>
          <div className={`flex items-center gap-1.5 text-sm ${colorClass}`}>
            <TrendIcon className="h-4 w-4" />
            <span>
              {formatCurrency(Math.abs(quote.d))} {isPositive ? 'up' : 'down'} from previous close
            </span>
          </div>
        </div>

        {/* Price Details Grid */}
        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border/50">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Previous Close</p>
            <p className="text-sm font-semibold text-foreground">
              {formatCurrency(quote.pc)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Open</p>
            <p className="text-sm font-semibold text-foreground">
              {formatCurrency(quote.o)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Day High</p>
            <p className="text-sm font-semibold text-green-600 dark:text-green-400">
              {formatCurrency(quote.h)}
            </p>
          </div>
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Day Low</p>
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">
              {formatCurrency(quote.l)}
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}