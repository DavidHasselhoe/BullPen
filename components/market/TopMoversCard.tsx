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
import { useExchanges } from '@/hooks/use-market-status';
import { Sparkline } from '@/components/viz/Sparkline';
import type { MarketMover } from '@/lib/twelvedata/twelvedata-client';

/**
 * Human-readable label for the session the movers data is from, in ET — now
 * holiday-aware. A US market holiday (e.g. the observed July 4th) is treated
 * like a closed day: the label rolls back to the last actual trading day rather
 * than naming the closed date. Uses the NYSE holiday calendar from /api/exchanges.
 */
function useMoversDateLabel(): string {
  const { data } = useExchanges();

  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const h = nowET.getHours();
  const m = nowET.getMinutes();

  // Full-closure NYSE holidays as YYYY-MM-DD (early-close days still trade).
  const closedDates = new Set(
    (data?.holidays ?? [])
      .filter((hol) => hol.exchange_code === 'NYSE' && hol.type === 'closed')
      .map((hol) => hol.date)
  );

  const ymd = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  const isClosedDay = (d: Date) => {
    const wd = d.getDay();
    return wd === 0 || wd === 6 || closedDates.has(ymd(d));
  };
  const lastTradingDay = (from: Date) => {
    const d = new Date(from);
    for (let i = 0; i < 10 && isClosedDay(d); i++) d.setDate(d.getDate() - 1);
    return d;
  };

  // Weekend or holiday: the market is closed today, so show the last trading day.
  if (isClosedDay(nowET)) {
    return `${fmt(lastTradingDay(nowET))} · Market closed`;
  }

  const etMins = h * 60 + m;
  const isPreMarket = etMins >= 240 && etMins < 570;   // 4:00 AM – 9:30 AM
  const isAfterHours = etMins >= 960 && etMins < 1200; // 4:00 PM – 8:00 PM

  if (isPreMarket) return `${fmt(nowET)} · Pre-market`;
  if (isAfterHours) return `${fmt(nowET)} · After-hours`;

  // Before pre-market (midnight – 4:00 AM ET): data is still from the previous
  // trading day's close — walk back over the weekend and any holiday.
  if (etMins < 240) {
    const prev = new Date(nowET);
    prev.setDate(prev.getDate() - 1);
    return fmt(lastTradingDay(prev));
  }

  return fmt(nowET);
}

interface TopMoversCardProps {
  gainers: MarketMover[];
  losers: MarketMover[];
  isLoading?: boolean;
  isError?: boolean;
  isHoldingsMode?: boolean;
}

// ─── Intraday sparkline ───────────────────────────────────────────────────────
// Single batch request instead of N parallel fetches — all symbols load together
// so sparklines are always consistent (no partial-load flicker).

function useMoversSparklines(symbols: string[], enabled: boolean) {
  const key = symbols.slice().sort().join(',');
  return useQuery({
    queryKey: ['movers-sparklines-batch', key],
    queryFn: async (): Promise<Record<string, number[]>> => {
      if (!key) return {};
      const res = await fetch(`/api/market/movers-sparklines?symbols=${encodeURIComponent(key)}`);
      if (!res.ok) return {};
      const json = await res.json();
      return (json.sparklines as Record<string, number[]>) ?? {};
    },
    enabled,
    staleTime: 5 * 60 * 1000,   // matches server CDN TTL
    gcTime: 15 * 60 * 1000,
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min during market hours
    retry: 1,
  });
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
          <Sparkline
            data={sparkPrices ?? []}
            direction={isGainer ? 'up' : 'down'}
            width={40}
            height={22}
            fallbackArrow
            preserveAspectRatio="xMidYMid meet"
            className="shrink-0 opacity-80 hidden sm:block w-10 h-6"
            ariaLabel={`${mover.symbol} intraday trend`}
          />
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

export function TopMoversCard({ gainers, losers, isLoading, isError, isHoldingsMode }: TopMoversCardProps) {
  const dateLabel = useMoversDateLabel();
  const allTickers = [...(gainers || []), ...(losers || [])].map((m) => m.symbol);

  const { data: sparklines } = useMoversSparklines(allTickers, !isLoading && allTickers.length > 0);

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

  if (isError) {
    return (
      <Card className="border-border/50 min-w-0 overflow-hidden">
        <CardHeader>
          <CardTitle>Top Market Movers</CardTitle>
          <p className="text-xs text-muted-foreground">{dateLabel}</p>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground py-8 text-center">
            Couldn&apos;t load market movers. Try again in a moment.
          </p>
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
                {isHoldingsMode ? 'None of your holdings are up right now' : 'No data available'}
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
                {isHoldingsMode ? 'None of your holdings are down right now' : 'No data available'}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}