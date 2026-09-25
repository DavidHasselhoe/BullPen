'use client';

/**
 * Tracked politicians' trades in the signed-in user's own holdings and
 * watchlist, last 90 days. The cross-reference is the Pro tool; free users
 * see only the count as the upsell (the trades themselves stay free on every
 * stock and member page). Hidden when nothing overlaps.
 */

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Briefcase } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ProBadge } from '@/components/billing/ProBadge';
import { tradeDirection } from '@/lib/congress/types';
import type { ActivityTrade } from '@/lib/congress/insights';
import { cn } from '@/lib/utils';

interface OverlapResponse {
  locked: boolean;
  symbolCount: number;
  windowDays: number;
  held?: string[];
  trades?: ActivityTrade[];
}

export function YourStocksInWashington() {
  const { isAuthenticated } = useAuth();
  const { data } = useQuery({
    queryKey: ['congress-overlap'],
    queryFn: async (): Promise<OverlapResponse | null> => {
      const res = await fetch('/api/congress/overlap');
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (!data || data.symbolCount === 0) return null;

  const stocks = data.symbolCount === 1 ? '1 of your stocks' : `${data.symbolCount} of your stocks`;

  if (data.locked) {
    return (
      <div className="mb-5 flex items-center justify-between gap-4 rounded-xl border border-border/50 bg-card/40 px-4 py-3.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <Briefcase className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <p className="text-sm text-foreground">
            Politicians traded {stocks} in the last {data.windowDays} days. <ProBadge />
          </p>
        </div>
        <Link
          href="/upgrade"
          className="shrink-0 whitespace-nowrap rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary transition-colors hover:bg-primary/10"
        >
          See who
        </Link>
      </div>
    );
  }

  // One row per stock: who traded it, newest first.
  const bySymbol = new Map<string, ActivityTrade[]>();
  for (const t of data.trades ?? []) bySymbol.set(t.symbol, [...(bySymbol.get(t.symbol) ?? []), t]);
  const held = new Set(data.held ?? []);

  return (
    <div className="mb-6 rounded-xl border border-border/50 bg-card/40 p-4">
      <p className="mb-3 flex items-center gap-2 text-sm font-medium text-foreground">
        <Briefcase className="h-4 w-4 text-muted-foreground" aria-hidden />
        Politicians traded {stocks} in the last {data.windowDays} days
      </p>
      <ul className="divide-y divide-border/50">
        {[...bySymbol].map(([symbol, trades]) => {
          const people = [...new Map(trades.map((t) => [t.slug, t])).values()];
          return (
            <li key={symbol} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2">
              <Link href={`/stock/${symbol}`} className="w-16 shrink-0 font-mono text-sm font-semibold text-foreground underline-offset-2 hover:underline">
                {symbol}
              </Link>
              <span className="text-xs text-muted-foreground">{held.has(symbol) ? 'You own this' : 'On your watchlist'}</span>
              <span className="flex min-w-0 flex-1 flex-wrap gap-x-3 gap-y-1 text-sm">
                {people.map((t) => {
                  const dir = tradeDirection(t.tradeType);
                  return (
                    <Link key={t.slug} href={`/discover/politicians/${t.slug}`} className="underline-offset-2 hover:underline">
                      {t.displayName}{' '}
                      <span className={cn(dir === 'buy' ? 'text-emerald-600 dark:text-emerald-400' : dir === 'sell' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground')}>
                        {dir === 'buy' ? 'bought' : dir === 'sell' ? 'sold' : t.tradeType.toLowerCase()}
                      </span>
                    </Link>
                  );
                })}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
