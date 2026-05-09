'use client';

import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useHoldings, useRemoveHolding } from '@/hooks/use-holdings';
import { useAuth } from '@/hooks/use-auth';
import { Trash2, Edit2, ArrowUpRight, ArrowDownRight, Plus, Search, X, Loader2 } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import { logger } from '@/lib/utils/logger';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { cn } from '@/lib/utils';

// ─── Sparkline ────────────────────────────────────────────────────────────────

function buildSparkPath(prices: number[], w: number, h: number): string {
  if (prices.length < 2) return '';
  const pad = 1.5;
  const uw = w - pad * 2;
  const uh = h - pad * 2;
  const min = Math.min(...prices);
  const range = Math.max(...prices) - min || 1;
  return prices
    .map((p, i) => {
      const x = (pad + (i / (prices.length - 1)) * uw).toFixed(1);
      const y = (pad + uh - ((p - min) / range) * uh).toFixed(1);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
}

function SparklineCell({ ticker }: { ticker: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['sparkline', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/candles?range=1M`);
      const json = await res.json();
      return (json.candles as { t: number[]; c: number[] } | null) ?? null;
    },
    staleTime: 20 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });

  if (isLoading) return <Skeleton className="w-16 h-7 rounded" />;
  if (!data || data.c.length < 2) return <div className="w-16 h-7" />;

  // Downsample to at most 60 points for a clean line
  const raw = data.c;
  const step = Math.max(1, Math.floor(raw.length / 60));
  const prices = raw.filter((_, i) => i % step === 0);

  const isUp = prices[prices.length - 1] >= prices[0];
  const color = isUp ? '#22c55e' : '#ef4444';
  const path = buildSparkPath(prices, 64, 28);

  return (
    <svg width={64} height={28} className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

import { EditHoldingModal } from './EditHoldingModal';
import { DeleteHoldingDialog } from './DeleteHoldingDialog';
import type { HoldingWithPrice } from './types';
import { getSectorLabel } from './HoldingsPieChart';
import type { UserHolding } from '@/lib/types/database';
import { convertCurrency, formatCurrency as formatCurrencyValue, formatNumber as formatNumberUtil, formatPercent as formatPercentUtil, type CurrencyCode } from '@/lib/currency/currency-conversion';
import { useExchangeRates } from '@/hooks/use-exchange-rates';
import { useUserSettings } from '@/hooks/use-user-settings';

interface HoldingsTableProps {
  onAddClick?: () => void;
  holdingsWithPrices?: HoldingWithPrice[];
  /** When set, rows not matching this sector label are dimmed. */
  hoveredSector?: string | null;
  /** True while batch quotes are in-flight — shows shimmer in price columns. */
  isPricesLoading?: boolean;
}

// ─── Per-cell skeleton for price columns ─────────────────────────────────────

function PriceSkeleton({ wide }: { wide?: boolean }) {
  return <Skeleton className={cn('h-4 rounded', wide ? 'w-20' : 'w-14')} />;
}

// ─── Full-table skeleton row (matches column structure) ───────────────────────

function SkeletonTableRow({ index }: { index: number }) {
  return (
    <tr
      className="border-b border-border/50 holdings-row-enter"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <td className="py-4 px-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-lg shrink-0" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      </td>
      <td className="py-4 px-4"><Skeleton className="h-4 w-8" /></td>
      <td className="py-4 px-4"><Skeleton className="h-4 w-16" /></td>
      <td className="py-4 px-4"><Skeleton className="h-4 w-16" /></td>
      <td className="py-4 px-4"><Skeleton className="h-4 w-14" /></td>
      <td className="py-4 px-4"><Skeleton className="h-4 w-20" /></td>
      <td className="py-4 px-4">
        <div className="space-y-1">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-10" />
        </div>
      </td>
      <td className="py-4 px-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-1.5 w-14 rounded-full" />
          <Skeleton className="h-4 w-8" />
        </div>
      </td>
      <td className="py-4 px-3"><Skeleton className="h-7 w-16 rounded" /></td>
      <td className="py-4 px-4">
        <div className="flex items-center justify-end gap-2">
          <Skeleton className="h-7 w-7 rounded" />
          <Skeleton className="h-7 w-7 rounded" />
        </div>
      </td>
    </tr>
  );
}

export function HoldingsTable({ onAddClick, holdingsWithPrices: externalHoldings, hoveredSector, isPricesLoading }: HoldingsTableProps) {
  const { data: holdings, isLoading } = useHoldings();
  const { user } = useAuth();
  const { roundNumbers } = useUserSettings();
  const removeHolding = useRemoveHolding();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'marketValue' | 'symbol' | 'allocation'>('marketValue');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [editingHolding, setEditingHolding] = useState<UserHolding | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deletingHolding, setDeletingHolding] = useState<{ id: string; symbol: string; companyName: string } | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Get user's currency preference
  const userCurrency = useMemo((): CurrencyCode | null => {
    if (!user?.settings) return null;
    const settings = user.settings as Record<string, unknown>;
    const currency = settings.default_currency as string | undefined;
    // null or 'exchange' means "Based on exchange" (show USD for US stocks)
    if (!currency || currency === 'exchange') return null;
    return currency as CurrencyCode;
  }, [user]);

  const exchangeRates = useExchangeRates(userCurrency);

  // Only run the internal quote fetch when no live data is provided from the parent page.
  // When externalHoldings is present we skip this to avoid duplicate API calls.
  const quotes = useQuery({
    queryKey: ['holdings-quotes', holdings?.map((h) => h.symbol)],
    queryFn: async () => {
      if (!holdings || holdings.length === 0) return { quotes: {}, logos: {} };
      
      const supabase = createBrowserClient();
      const quoteMap: Record<string, { price: number; change: number; changePercent: number }> = {};
      const tickers = holdings.map((h) => h.symbol);

      // Single batched logo query instead of N individual queries
      const { data: companiesData } = await supabase
        .from('companies')
        .select('ticker, logo_url')
        .in('ticker', tickers);

      const dbLogoMap = new Map<string, string | null>(
        (companiesData || []).map((c) => [c.ticker, c.logo_url])
      );

      const logoMap: Record<string, string | null> = {};
      for (const ticker of tickers) {
        const dbLogo = dbLogoMap.get(ticker) ?? null;
        logoMap[ticker] = dbLogo ?? supabase.storage
          .from('company-logos')
          .getPublicUrl(`${ticker.toLowerCase()}.jpg`).data.publicUrl ?? null;
      }

      // Batch quotes (throttled server-side to avoid Twelve Data rate limits)
      const batchRes = await fetch('/api/quotes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: tickers }),
      });
      const batchData = await batchRes.json();
      if (batchRes.status === 429) {
        throw new Error(batchData.error || 'Market data rate limit exceeded. Please try again in a minute.');
      }
      if (batchData.success && batchData.quotes) {
        Object.assign(quoteMap, batchData.quotes);
      }

      return { quotes: quoteMap, logos: logoMap };
    },
    // Skip the internal fetch entirely when the parent already supplies live data.
    enabled: !externalHoldings && !!holdings && holdings.length > 0,
    staleTime: 3 * 60 * 1000,
    // Keep price cache for 5 min max — stale quotes older than this are garbage-
    // collected so returning users always see a fresh fetch, not stale prices.
    gcTime: 5 * 60 * 1000,
  });

  // True while price data is in-flight — drives skeleton cells in price columns.
  const isLoadingPrices = isPricesLoading !== undefined ? isPricesLoading : quotes.isLoading;

  // Combine holdings with quotes and calculate derived values.
  // Skipped when externalHoldings is provided — the parent already did this work.
  const internalHoldingsWithPrices = useMemo((): HoldingWithPrice[] => {
    if (externalHoldings) return externalHoldings;
    if (!holdings) return [];
    
    const quotesMap = quotes.data?.quotes || {};
    const logosMap = quotes.data?.logos || {};
    const rates = exchangeRates.data;
    
    // Calculate total market value (in USD)
    const totalMarketValue = holdings.reduce((sum, holding) => {
      const quote = quotesMap[holding.symbol];
      if (quote && holding.quantity) {
        return sum + quote.price * holding.quantity;
      }
      return sum;
    }, 0);

    return holdings.map((holding) => {
      const quote = quotesMap[holding.symbol];
      const logoUrl = logosMap[holding.symbol] || null;
      
      // All values are in USD initially
      const currentPriceUSD = quote?.price;
      const dayChangeUSD = quote?.change;
      const dayChangePercent = quote?.changePercent;
      
      const marketValueUSD = currentPriceUSD && holding.quantity
        ? currentPriceUSD * holding.quantity
        : undefined;
      
      const unrealizedPLUSD = currentPriceUSD && holding.avg_price && holding.quantity
        ? (currentPriceUSD - holding.avg_price) * holding.quantity
        : undefined;
      
      const unrealizedPLPercent = currentPriceUSD && holding.avg_price
        ? ((currentPriceUSD - holding.avg_price) / holding.avg_price) * 100
        : undefined;
      
      const allocation = marketValueUSD && totalMarketValue > 0
        ? (marketValueUSD / totalMarketValue) * 100
        : undefined;

      // Convert to user's preferred currency if specified
      let currentPrice: number | undefined = currentPriceUSD;
      let dayChange: number | undefined = dayChangeUSD;
      let marketValue: number | undefined = marketValueUSD;
      let unrealizedPL: number | undefined = unrealizedPLUSD;
      let avg_price: number | null = holding.avg_price;
      
      if (userCurrency && rates) {
        currentPrice = currentPriceUSD ? convertCurrency(currentPriceUSD, 'USD', userCurrency, rates) : undefined;
        dayChange = dayChangeUSD ? convertCurrency(dayChangeUSD, 'USD', userCurrency, rates) : undefined;
        marketValue = marketValueUSD ? convertCurrency(marketValueUSD, 'USD', userCurrency, rates) : undefined;
        unrealizedPL = unrealizedPLUSD ? convertCurrency(unrealizedPLUSD, 'USD', userCurrency, rates) : undefined;
        avg_price = holding.avg_price !== null ? convertCurrency(holding.avg_price, 'USD', userCurrency, rates) : null;
      }

      return {
        ...holding,
        currentPrice,
        dayChange,
        dayChangePercent,
        marketValue,
        unrealizedPL,
        unrealizedPLPercent,
        allocation,
        logoUrl,
        avg_price,
      };
    });
  }, [externalHoldings, holdings, quotes.data, exchangeRates.data, userCurrency]);

  // Alias so the rest of the component is unchanged.
  const holdingsWithPrices = internalHoldingsWithPrices;

  const maxAllocation = useMemo(
    () => Math.max(...holdingsWithPrices.map((h) => h.allocation ?? 0), 1),
    [holdingsWithPrices]
  );

  // Sort holdings
  const sortedHoldings = useMemo(() => {
    if (!holdingsWithPrices) return [];
    
    const sorted = [...holdingsWithPrices].sort((a, b) => {
      let comparison = 0;
      
      if (sortBy === 'marketValue') {
        const aVal = a.marketValue || 0;
        const bVal = b.marketValue || 0;
        comparison = aVal - bVal;
      } else if (sortBy === 'symbol') {
        comparison = a.symbol.localeCompare(b.symbol);
      } else if (sortBy === 'allocation') {
        const aVal = a.allocation || 0;
        const bVal = b.allocation || 0;
        comparison = aVal - bVal;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  }, [holdingsWithPrices, sortBy, sortOrder]);

  // Apply search filter after sorting
  const filteredHoldings = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedHoldings;
    return sortedHoldings.filter(
      (h) =>
        h.symbol.toLowerCase().includes(q) ||
        h.company_name.toLowerCase().includes(q)
    );
  }, [sortedHoldings, search]);

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  const handleRemoveClick = (holding: UserHolding) => {
    setDeletingHolding({
      id: holding.id,
      symbol: holding.symbol,
      companyName: holding.company_name,
    });
    setIsDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!deletingHolding) return;
    
    try {
      await removeHolding.mutateAsync(deletingHolding.id);
    } catch (error) {
      logger.error('Error removing holding', error);
    } finally {
      setDeletingHolding(null);
    }
  };

  const handleEdit = (holding: UserHolding) => {
    setEditingHolding(holding);
    setIsEditModalOpen(true);
  };

  if (isLoading) {
    return (
      <>
        <style>{`
          @keyframes holdingsRowIn {
            from { opacity: 0; transform: translateY(5px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .holdings-row-enter {
            animation: holdingsRowIn 0.28s ease-out both;
          }
        `}</style>
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle>My Holdings</CardTitle>
              <Skeleton className="h-8 w-56 rounded-lg" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Symbol</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Quantity</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Avg Price</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Current Price</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Day Change</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Market Value</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Unrealized P/L</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">Allocation</th>
                    <th className="py-3 px-4" />
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <SkeletonTableRow key={i} index={i} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  if (!holdings || holdings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My Holdings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center text-center py-4">
            <div className="flex items-center justify-center h-16 w-16 rounded-full bg-muted/50 mb-4">
              <Plus className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="font-semibold text-foreground">No holdings yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Add stocks to track your portfolio, see performance, and get AI-powered insights.
            </p>
          </div>
          {onAddClick && (
            <button
              onClick={onAddClick}
              className="w-full flex items-center justify-center gap-2 py-5 rounded-lg border-2 border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-colors group"
            >
              <span className="flex items-center justify-center h-8 w-8 rounded-full border-2 border-dashed border-border/60 group-hover:border-primary/50 transition-colors">
                <Plus className="h-4 w-4" />
              </span>
              <span className="text-sm font-medium">Add your first holding</span>
            </button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <style>{`
      @keyframes holdingsRowIn {
        from { opacity: 0; transform: translateY(5px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .holdings-row-enter {
        animation: holdingsRowIn 0.28s ease-out both;
      }
    `}</style>
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle>My Holdings</CardTitle>
          {/* Search */}
          <div className="relative w-full sm:w-56">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Search holdings…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-7 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>
        {search && (
          <p className="text-xs text-muted-foreground mt-1">
            Showing {filteredHoldings.length} of {sortedHoldings.length} holding{sortedHoldings.length !== 1 ? 's' : ''}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  <button
                    onClick={() => handleSort('symbol')}
                    className="hover:text-foreground transition-colors"
                  >
                    Symbol
                  </button>
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  Quantity
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  Avg Price
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  Current Price
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  Day Change
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  <button
                    onClick={() => handleSort('marketValue')}
                    className="hover:text-foreground transition-colors"
                  >
                    Market Value
                  </button>
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  Unrealized P/L
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  <button
                    onClick={() => handleSort('allocation')}
                    className="hover:text-foreground transition-colors"
                  >
                    Allocation
                  </button>
                </th>
                <th className="py-3 px-4" />
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredHoldings.length === 0 && search && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                    No holdings match &ldquo;{search}&rdquo;
                  </td>
                </tr>
              )}
              {filteredHoldings.map((holding, rowIndex) => {
                const priceKnown = holding.currentPrice !== undefined;
                const showPriceSkeleton = isLoadingPrices && !priceKnown;

                const isPositive = (holding.dayChangePercent ?? 0) >= 0;
                const plIsPositive = (holding.unrealizedPLPercent ?? 0) >= 0;
                const dayChangeColor = isPositive
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400';
                const plColor = plIsPositive
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400';

                const isHighlighted =
                  !hoveredSector || getSectorLabel(holding) === hoveredSector;

                return (
                  <tr
                    key={holding.id}
                    className={cn(
                      'border-b border-border/50 hover:bg-muted/30 transition-all duration-200 holdings-row-enter',
                      !isHighlighted && 'opacity-25'
                    )}
                    style={{ animationDelay: `${rowIndex * 45}ms` }}
                  >
                    <td className="py-4 px-4">
                      <Link
                        href={slugToAssetPath(holding.symbol)}
                        className="flex items-center gap-3 group"
                      >
                        <CompanyLogo
                          name={holding.company_name}
                          ticker={holding.symbol}
                          logoUrl={holding.logoUrl || null}
                          size={48}
                        />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-foreground group-hover:underline">
                              {holding.symbol}
                            </span>
                            {holding.source === 'snaptrade' && (
                              <span className="inline-flex items-center rounded-full bg-blue-500/10 px-1.5 py-0 text-[10px] font-medium text-blue-400 border border-blue-500/20">
                                synced
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {holding.company_name}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="py-4 px-4 text-sm text-foreground">
                      {holding.quantity !== null ? formatNumberUtil(holding.quantity, roundNumbers) : '—'}
                    </td>
                    <td className="py-4 px-4 text-sm text-foreground">
                      {holding.avg_price !== null && holding.avg_price !== undefined
                        ? formatCurrencyValue(holding.avg_price, userCurrency || 'USD', roundNumbers ? { round: true } : undefined)
                        : '—'}
                    </td>
                    <td className="py-4 px-4 text-sm font-medium text-foreground">
                      {showPriceSkeleton ? (
                        <PriceSkeleton />
                      ) : holding.currentPrice !== undefined ? (
                        <span className="animate-in fade-in duration-300">
                          {formatCurrencyValue(holding.currentPrice, userCurrency || 'USD', roundNumbers ? { round: true } : undefined)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-4 px-4">
                      {showPriceSkeleton ? (
                        <PriceSkeleton />
                      ) : holding.dayChangePercent !== undefined ? (
                        <div className={cn('flex items-center gap-1 animate-in fade-in duration-300', dayChangeColor)}>
                          {isPositive ? (
                            <ArrowUpRight className="h-3 w-3" />
                          ) : (
                            <ArrowDownRight className="h-3 w-3" />
                          )}
                          <span className="text-sm font-medium">
                            {formatPercentUtil(holding.dayChangePercent, roundNumbers)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-sm font-medium text-foreground">
                      {showPriceSkeleton ? (
                        <PriceSkeleton wide />
                      ) : holding.marketValue !== undefined ? (
                        <span className="animate-in fade-in duration-300">
                          {formatCurrencyValue(holding.marketValue, userCurrency || 'USD', roundNumbers ? { round: true } : undefined)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="py-4 px-4">
                      {showPriceSkeleton ? (
                        <div className="space-y-1">
                          <PriceSkeleton />
                          <PriceSkeleton />
                        </div>
                      ) : holding.unrealizedPL !== undefined ? (
                        <div className={cn(plColor, 'animate-in fade-in duration-300')}>
                          <div className="text-sm font-medium">
                            {formatCurrencyValue(holding.unrealizedPL, userCurrency || 'USD', roundNumbers ? { round: true } : undefined)}
                          </div>
                          {holding.unrealizedPLPercent !== undefined && (
                            <div className="text-xs">
                              {formatPercentUtil(holding.unrealizedPLPercent, roundNumbers)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-4 px-4">
                      {showPriceSkeleton ? (
                        <div className="flex items-center gap-2">
                          <Skeleton className="h-1.5 w-14 rounded-full" />
                          <Skeleton className="h-4 w-8" />
                        </div>
                      ) : holding.allocation !== undefined ? (
                        <div className="flex items-center gap-2.5 min-w-[100px] animate-in fade-in duration-300">
                          <div className="w-14 h-1 rounded-full bg-muted/50 overflow-hidden shrink-0">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${(holding.allocation / maxAllocation) * 100}%`,
                                backgroundColor: '#a855f7',
                              }}
                            />
                          </div>
                          <span className="text-sm tabular-nums text-foreground">
                            {holding.allocation.toFixed(roundNumbers ? 0 : 1)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-4 px-3">
                      <SparklineCell ticker={holding.symbol} />
                    </td>
                    <td className="py-4 px-4">
                      {(() => {
                        const isDeleting =
                          removeHolding.isPending && deletingHolding?.id === holding.id;
                        const anyPending = removeHolding.isPending;
                        return (
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEdit(holding)}
                              disabled={anyPending || isEditModalOpen}
                              title="Edit holding"
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRemoveClick(holding)}
                              disabled={anyPending}
                              title={isDeleting ? 'Removing…' : 'Remove holding'}
                            >
                              {isDeleting ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Trash2 className="h-4 w-4" />
                              )}
                            </Button>
                          </div>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}
              {onAddClick && (
                <tr>
                  <td colSpan={10} className="p-0 align-middle">
                    <button
                      onClick={onAddClick}
                      className="w-full flex items-center justify-center gap-2 py-5 text-muted-foreground hover:text-primary hover:bg-muted/20 transition-colors group"
                    >
                      <span className="flex items-center justify-center h-8 w-8 rounded-full border border-dashed border-border/60 group-hover:border-primary/50 group-hover:bg-primary/5 transition-colors">
                        <Plus className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-medium">Add holding</span>
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
      <EditHoldingModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        holding={editingHolding}
      />
      {deletingHolding && (
        <DeleteHoldingDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          onConfirm={handleConfirmDelete}
          symbol={deletingHolding.symbol}
          companyName={deletingHolding.companyName}
          isLoading={removeHolding.isPending}
        />
      )}
    </Card>
    </>
  );
}
