'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { useAuth } from '@/hooks/use-auth';
import { useHoldings } from '@/hooks/use-holdings';
import { useWatchlist } from '@/hooks/use-watchlist';
import { slugToAssetPath } from '@/lib/assets/asset-type';

interface Quote {
  price: number;
  change: number;
  changePercent: number;
}

export function WhyTodayWidget() {
  const { isAuthenticated } = useAuth();
  const { data: holdings } = useHoldings();
  const { data: watchlist } = useWatchlist();
  const { openWhyToday } = useAIPanel();

  const symbols = useMemo(() => {
    const set = new Set<string>();
    for (const h of holdings ?? []) set.add(h.symbol);
    for (const w of watchlist ?? []) set.add(w.symbol);
    return Array.from(set);
  }, [holdings, watchlist]);

  // Same REST batch quote endpoint PortfolioSummaryWidget/HoldingsTable use —
  // a single reliable fetch on load, not the live-tick SSE stream (which can
  // sit silent with no fallback when markets are closed or WsManager hasn't
  // seen the symbol yet).
  const { data: quotes, isLoading } = useQuery({
    queryKey: ['why-today-quotes', symbols],
    queryFn: async (): Promise<Record<string, Quote>> => {
      if (symbols.length === 0) return {};
      const res = await fetch('/api/quotes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols }),
      });
      if (!res.ok) return {};
      const json = await res.json();
      return json.success ? json.quotes : {};
    },
    enabled: symbols.length > 0,
    staleTime: 3 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Biggest mover among what the user actually holds or watches — not a
  // generic market pick.
  const featured = useMemo(() => {
    let best: { symbol: string } & Quote | null = null;
    for (const symbol of symbols) {
      const q = quotes?.[symbol];
      if (!q) continue;
      if (!best || Math.abs(q.changePercent) > Math.abs(best.changePercent)) {
        best = { symbol, ...q };
      }
    }
    return best;
  }, [symbols, quotes]);

  if (!isAuthenticated) return null;

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-3 mb-3">
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-muted-foreground/85 shrink-0">
          Why today
        </span>
        <div className="flex-1 h-px bg-border/50" />
      </div>

      {symbols.length === 0 ? (
        <p className="text-sm text-muted-foreground/85">
          Add a holding or watch a stock to see what&apos;s moving and why.
        </p>
      ) : isLoading ? (
        <div className="flex items-center gap-3 rounded-lg border border-border/30 bg-muted/10 px-4 py-3">
          <div className="h-8 w-8 rounded-full animate-shimmer shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3 w-24 animate-shimmer rounded" />
            <div className="h-2.5 w-16 animate-shimmer rounded" />
          </div>
        </div>
      ) : !featured ? (
        <p className="text-sm text-muted-foreground/85">
          No price data available right now — check back later.
        </p>
      ) : (
        <div className="rounded-lg border border-border/30 bg-muted/10 overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3">
            <CompanyLogo ticker={featured.symbol} name={featured.symbol} size={32} />
            <Link href={slugToAssetPath(featured.symbol)} className="flex-1 min-w-0 group">
              <p className="text-sm font-semibold text-foreground group-hover:underline truncate">
                ${featured.symbol}
              </p>
              <p className="text-xs text-muted-foreground/80">Today&apos;s biggest move in your list</p>
            </Link>
            <ChangeBadge changePercent={featured.changePercent} />
            <button
              onClick={() => openWhyToday({
                ticker: featured.symbol,
                price: featured.price,
                change: featured.change,
                changePct: featured.changePercent,
              })}
              className="shrink-0 text-xs font-medium rounded-md px-2.5 py-1.5 border border-border/40 text-muted-foreground transition-colors hover:text-foreground hover:border-border"
            >
              Why?
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ChangeBadge({ changePercent }: { changePercent: number }) {
  const isUp = changePercent > 0;
  const isDown = changePercent < 0;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-mono font-semibold shrink-0',
        isUp && 'bg-emerald-500/10 text-emerald-500',
        isDown && 'bg-red-500/10 text-red-500',
        !isUp && !isDown && 'bg-muted/40 text-muted-foreground'
      )}
    >
      <Icon className="h-3 w-3" />
      {isUp ? '+' : ''}
      {changePercent.toFixed(2)}%
    </span>
  );
}
