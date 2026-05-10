'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown } from 'lucide-react';
import Link from 'next/link';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { CompanyRowActions } from '@/components/discover/CompanyRowActions';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import type { MarketMover } from '@/lib/twelvedata/twelvedata-client';
import { useAuth } from '@/hooks/use-auth';

/** Returns a human-readable label for the current trading session, using ET. */
function useMoversDateLabel(): string {
  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = nowET.getDay(); // 0=Sun 6=Sat
  const h = nowET.getHours();
  const m = nowET.getMinutes();

  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  // Weekend: show last Friday's close
  if (day === 0 || day === 6) {
    const lastFriday = new Date(nowET);
    lastFriday.setDate(nowET.getDate() - (day === 0 ? 2 : 1));
    return `${fmt(lastFriday)} · Market closed`;
  }

  const etMins = h * 60 + m;
  const isPreMarket = etMins >= 240 && etMins < 570;   // 4:00 AM – 9:30 AM
  const isAfterHours = etMins >= 960 && etMins < 1200; // 4:00 PM – 8:00 PM

  if (isPreMarket) return `${fmt(nowET)} · Pre-market`;
  if (isAfterHours) return `${fmt(nowET)} · After-hours`;

  // Before pre-market (midnight – 4:00 AM ET): data is still from the previous
  // trading day's close. Pre-market at 4:00 AM is the first point where today's
  // session data starts coming in, so we only advance the date then.
  if (etMins < 240) {
    const prevClose = new Date(nowET);
    // Monday midnight–4am → roll back to Friday (3 days)
    prevClose.setDate(nowET.getDate() - (day === 1 ? 3 : 1));
    return fmt(prevClose);
  }

  return fmt(nowET);
}

interface TopMoversCardProps {
  gainers: MarketMover[];
  losers: MarketMover[];
  isLoading?: boolean;
  isHoldingsMode?: boolean;
}

// ─── Intraday sparkline ───────────────────────────────────────────────────────

function useMoversSparklines(symbols: string[], enabled: boolean) {
  return useQuery({
    queryKey: ['movers-sparklines-1d', symbols.slice().sort()],
    queryFn: async (): Promise<Record<string, number[]>> => {
      const results = await Promise.all(
        symbols.map(async (sym) => {
          try {
            const res = await fetch(`/api/stock/${encodeURIComponent(sym)}/candles?range=1D`);
            if (!res.ok) return [sym, [] as number[]] as const;
            const json = await res.json();
            const closes: number[] = json.candles?.c ?? [];
            return [sym, closes] as const;
          } catch {
            return [sym, [] as number[]] as const;
          }
        })
      );
      return Object.fromEntries(results);
    },
    enabled,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    retry: false,
  });
}

/** Renders a real intraday price sparkline, or falls back to a static direction arrow. */
function MiniSparkline({ prices, isUp, className }: { prices: number[]; isUp: boolean; className?: string }) {
  const stroke = isUp ? 'rgb(34, 197, 94)' : 'rgb(239, 68, 68)';

  if (prices.length < 2) {
    // Static fallback arrow
    const path = isUp ? 'M 2 12 L 6 8 L 10 10 L 14 4' : 'M 2 4 L 6 8 L 10 6 L 14 12';
    return (
      <svg viewBox="0 0 16 16" className={className} width={40} height={24} fill="none"
        strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d={path} stroke={stroke} />
      </svg>
    );
  }

  const W = 40, H = 22;
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;
  const pad = 2;

  const pts = prices.map((p, i) => {
    const x = (i / (prices.length - 1)) * W;
    const y = H - pad - ((p - min) / range) * (H - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} width={40} height={24} fill="none">
      <polyline
        points={pts.join(' ')}
        stroke={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function MoverItem({
  mover,
  isGainer,
  companyName,
  sparkPrices,
}: {
  mover: MarketMover;
  isGainer: boolean;
  companyName?: string;
  sparkPrices?: number[];
}) {
  const textColor = isGainer ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  // Prefer DB batch name → stream name → ticker symbol (never blank)
  const displayName = companyName || mover.name || mover.symbol;
  // Only show ticker-on-hover animation when we actually have a distinct full name
  const hasDistinctName = displayName !== mover.symbol;

  return (
    <div className="group grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg p-2.5 -mx-2 transition-all duration-200 hover:bg-accent/50 hover:shadow-sm border border-transparent hover:border-border/50">
      <Link href={slugToAssetPath(mover.symbol)} className="contents">
        <div className="flex items-center gap-2 shrink-0">
          <CompanyLogo
            name={displayName}
            ticker={mover.symbol}
            logoUrl={mover.logoUrl}
            size={32}
          />
          <MiniSparkline prices={sparkPrices ?? []} isUp={isGainer} className="shrink-0 opacity-80 hidden sm:block" />
        </div>
        <div className="min-w-0 overflow-hidden flex flex-col justify-center relative">
          {/* Default: full company name (uses all space when actions are collapsed) */}
          <div className="font-extrabold text-foreground text-sm tracking-tight overflow-hidden">
            <span
              className={cn(
                'block truncate transition-all duration-200 ease-out',
                hasDistinctName
                  ? 'opacity-100 translate-x-0 group-hover:opacity-0 group-hover:-translate-x-1'
                  : ''
              )}
              title={displayName}
            >
              {displayName}
            </span>
            {/* Hover: ticker slides in, replacing the full name */}
            {hasDistinctName && (
              <span
                className="absolute left-0 top-0 opacity-0 translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all duration-200 ease-out tabular-nums"
                title={displayName}
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

export function TopMoversCard({ gainers, losers, isLoading, isHoldingsMode }: TopMoversCardProps) {
  const dateLabel = useMoversDateLabel();
  const { isAuthenticated } = useAuth();
  const allTickers = [...(gainers || []), ...(losers || [])].map((m) => m.symbol);

  const { data: sparklines } = useMoversSparklines(allTickers, isAuthenticated && !isLoading && allTickers.length > 0);

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

  // Build name map: TwelveData REST names first, then Supabase batch (only real names, not ticker-fallbacks)
  const companyNameMap = new Map<string, string>([
    ...[...gainers, ...losers]
      .filter((m) => m.name && m.name !== m.symbol)
      .map((m): [string, string] => [m.symbol, m.name!]),
    ...(companyBatch || [])
      .filter((c) => c.name && c.name !== c.ticker)
      .map((c): [string, string] => [c.ticker, c.name]),
  ]);

  if (isLoading) {
    return (
      <Card className="border-border/50 min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle>Top Market Movers</CardTitle>
          <p className="text-xs text-muted-foreground">{dateLabel}</p>
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
        <CardTitle className="flex items-center gap-2">
          Top Market Movers
          {isHoldingsMode && (
            <span className="text-xs font-normal text-muted-foreground">(from your portfolio)</span>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">{dateLabel}</p>
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
                  sparkPrices={sparklines?.[mover.symbol]}
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
                  sparkPrices={sparklines?.[mover.symbol]}
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