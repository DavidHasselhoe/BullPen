'use client';

/**
 * InsiderTransactionsCard — net-flow-first insider activity.
 *
 * Leads with a FlowBar of total $ bought vs $ sold + one insight sentence.
 * The sentiment pill is value-based (dollars), not count-based — ten small
 * buys no longer read as "bullish" against one massive sale. Counts remain
 * as secondary text.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import { TrendingUp, TrendingDown, Minus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FlowBar } from '@/components/viz/FlowBar';
import type { InsiderTransaction } from '@/lib/twelvedata/twelvedata-client';

interface InsiderResponse {
  success: boolean;
  data?: InsiderTransaction[];
  error?: string;
}

function fmtValue(v: number): string {
  if (!v || isNaN(v)) return '—';
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString('en-US')}`;
}

function fmtShares(v: number): string {
  if (!v || isNaN(v)) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toLocaleString();
}

function fmtDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

const TYPE_CONFIG = {
  buy: {
    icon: TrendingUp,
    label: 'Purchase',
    plainLabel: 'Bought',
    color: 'text-emerald-500',
    badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
  },
  sell: {
    icon: TrendingDown,
    label: 'Sale',
    plainLabel: 'Sold',
    color: 'text-red-500',
    badgeClass: 'bg-red-500/10 text-red-500 border-red-500/20',
  },
  other: {
    icon: Minus,
    label: 'Other',
    plainLabel: 'Other',
    color: 'text-muted-foreground',
    badgeClass: 'bg-muted text-muted-foreground border-border',
  },
} as const;

const INITIAL_SHOW = 8;

export function InsiderTransactionsCard({ ticker }: { ticker: string }) {
  const { isSimplified } = useExperienceLevel();
  const [showAll, setShowAll] = useState(false);
  const [requested, setRequested] = useState(false);

  const { data, isLoading } = useQuery<InsiderResponse>({
    queryKey: ['insider-transactions', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/insider-transactions`);
      return res.json();
    },
    enabled: requested,
    staleTime: 7 * 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
  });

  // Gate: show a prompt until the user explicitly requests the data
  if (!requested) {
    return (
      <Card className="mb-8">
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground">Insider Transactions</p>
              <p className="text-xs text-muted-foreground/70">
                {isSimplified
                  ? 'See when executives buy or sell their own stock'
                  : 'SEC Form 4 filings by executives, directors & 10%+ shareholders'}
              </p>
            </div>
          </div>
          <button
            onClick={() => setRequested(true)}
            className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors whitespace-nowrap"
          >
            View
          </button>
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" />
            Insider Transactions
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-14 w-full rounded-lg" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-3.5 w-20" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data?.success) return null;

  const transactions = data.data ?? [];
  if (transactions.length === 0) return null;

  const visible = showAll ? transactions : transactions.slice(0, INITIAL_SHOW);

  // Value-based flow summary
  const buys = transactions.filter((t) => t.transaction_type === 'buy');
  const sells = transactions.filter((t) => t.transaction_type === 'sell');
  const buyValue = buys.reduce((sum, t) => sum + Math.abs(t.value || 0), 0);
  const sellValue = sells.reduce((sum, t) => sum + Math.abs(t.value || 0), 0);
  const net = buyValue - sellValue;
  const sentiment = net > 0 ? 'bullish' : net < 0 ? 'bearish' : 'neutral';
  const netAbs = fmtValue(Math.abs(net));
  const tradeCount = buys.length + sells.length;

  const insight =
    tradeCount === 0
      ? null
      : net === 0
        ? `Insider buying and selling roughly balanced across ${tradeCount} trades`
        : `Insiders net ${net > 0 ? 'bought' : 'sold'} ${netAbs} of stock across ${tradeCount} recent trades`;

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Insider Transactions
            </CardTitle>
            {isSimplified ? (
              <p className="text-xs text-muted-foreground mt-1">
                When company executives buy or sell their own stock, it can signal their confidence in the company&apos;s future.
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                Trades by executives, directors, and 10%+ shareholders — filed with the SEC.
              </p>
            )}
          </div>
          {/* Value-based sentiment pill */}
          <div className="flex items-center gap-2 text-xs">
            <span className={cn(
              'flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium tabular-nums',
              sentiment === 'bullish' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
              sentiment === 'bearish' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
              'bg-muted text-muted-foreground border-border'
            )}>
              {sentiment === 'bullish' ? <TrendingUp className="h-3 w-3" /> : sentiment === 'bearish' ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              {sentiment === 'neutral' ? 'Balanced' : `Net ${net > 0 ? '+' : '−'}${netAbs}`}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Money-flow summary */}
        {(buyValue > 0 || sellValue > 0) && (
          <div className="mb-4 rounded-lg border border-border/50 bg-accent/20 px-4 py-3">
            <FlowBar
              inflow={buyValue}
              inLabel={`Bought ${buyValue > 0 ? fmtValue(buyValue) : '$0'} (${buys.length})`}
              outflow={sellValue}
              outLabel={`Sold ${sellValue > 0 ? fmtValue(sellValue) : '$0'} (${sells.length})`}
              srLabel={`Insiders bought ${fmtValue(buyValue)} and sold ${fmtValue(sellValue)}`}
            />
            {insight && <p className="mt-2 text-xs text-muted-foreground">{insight}</p>}
          </div>
        )}

        {/* Table header */}
        <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_80px_100px_90px] items-center gap-x-4 pb-2 border-b border-border text-xs font-medium text-muted-foreground">
          <span>Insider</span>
          <span className="hidden sm:block text-right">Type</span>
          <span className="hidden sm:block text-right">Shares</span>
          <span className="text-right">Value</span>
        </div>

        <div className="divide-y divide-border/50">
          {visible.map((t, i) => {
            const cfg = TYPE_CONFIG[t.transaction_type];
            const Icon = cfg.icon;
            return (
              <div
                key={i}
                className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_80px_100px_90px] items-center gap-x-4 py-3"
              >
                {/* Insider info */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {t.full_name
                      .split(' ')
                      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
                      .join(' ')}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">{t.position}</p>
                  <p className="text-xs text-muted-foreground/60 mt-0.5">{fmtDate(t.date_reported)}</p>
                </div>

                {/* Type badge */}
                <div className="hidden sm:flex justify-end">
                  <Badge
                    variant="outline"
                    className={cn('text-xs gap-1 font-medium px-2 py-0.5 h-auto', cfg.badgeClass)}
                  >
                    <Icon className="h-3 w-3" />
                    {isSimplified ? cfg.plainLabel : cfg.label}
                  </Badge>
                </div>

                {/* Shares */}
                <div className="hidden sm:block text-right">
                  <span className={cn('text-sm font-medium tabular-nums', cfg.color)}>
                    {t.transaction_type === 'sell' ? '-' : t.transaction_type === 'buy' ? '+' : ''}
                    {fmtShares(Math.abs(t.shares))}
                  </span>
                </div>

                {/* Value + mobile type badge */}
                <div className="text-right">
                  <span className={cn('text-sm font-semibold tabular-nums', cfg.color)}>
                    {fmtValue(Math.abs(t.value))}
                  </span>
                  <div className="sm:hidden mt-0.5">
                    <Badge
                      variant="outline"
                      className={cn('text-xs gap-1 font-medium px-1.5 py-0.5 h-auto', cfg.badgeClass)}
                    >
                      <Icon className="h-2.5 w-2.5" />
                      {isSimplified ? cfg.plainLabel : cfg.label}
                    </Badge>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {transactions.length > INITIAL_SHOW && (
          <button
            onClick={() => setShowAll((v) => !v)}
            className="mt-3 w-full rounded-lg border border-border py-2 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            {showAll
              ? 'Show less'
              : `Show ${transactions.length - INITIAL_SHOW} more transactions`}
          </button>
        )}
      </CardContent>
    </Card>
  );
}
