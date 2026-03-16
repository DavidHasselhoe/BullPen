'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useHoldings, useRemoveHolding } from '@/hooks/use-holdings';
import { useAuth } from '@/hooks/use-auth';
import { Trash2, Edit2, ArrowUpRight, ArrowDownRight, Plus, Search, X } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { logger } from '@/lib/utils/logger';
import { EditHoldingModal } from './EditHoldingModal';
import { DeleteHoldingDialog } from './DeleteHoldingDialog';
import type { HoldingWithPrice } from './types';
import type { UserHolding } from '@/lib/types/database';
import { getExchangeRates, convertCurrency, formatCurrency as formatCurrencyValue, formatNumber as formatNumberUtil, formatPercent as formatPercentUtil, type CurrencyCode } from '@/lib/currency/currency-conversion';
import { useUserSettings } from '@/hooks/use-user-settings';

interface HoldingsTableProps {
  onAddClick?: () => void;
}

export function HoldingsTable({ onAddClick }: HoldingsTableProps) {
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
    const settings = user.settings as any;
    const currency = settings.default_currency;
    // null or 'exchange' means "Based on exchange" (show USD for US stocks)
    if (!currency || currency === 'exchange') return null;
    return currency as CurrencyCode;
  }, [user]);

  // Fetch exchange rates if user selected a specific currency
  const exchangeRates = useQuery({
    queryKey: ['exchange-rates', userCurrency],
    queryFn: () => getExchangeRates('USD'),
    enabled: !!userCurrency,
    staleTime: 60 * 60 * 1000, // 1 hour - rates update daily at 1600 CET
    gcTime: 24 * 60 * 60 * 1000, // 24 hours
  });

  // Fetch quotes and logos (batched: 1 DB query for all logos + N quote fetches in parallel)
  const quotes = useQuery({
    queryKey: ['holdings-quotes', holdings?.map((h) => h.symbol)],
    queryFn: async () => {
      if (!holdings || holdings.length === 0) return {};
      
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
    enabled: !!holdings && holdings.length > 0,
    staleTime: 3 * 60 * 1000, // 3 minutes — reduces quote API load
    gcTime: 15 * 60 * 1000, // 15 minutes cache retention
  });

  // Combine holdings with quotes and calculate derived values
  const holdingsWithPrices = useMemo((): HoldingWithPrice[] => {
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
        avg_price, // Override with converted value
      };
    });
  }, [holdings, quotes.data, exchangeRates.data, userCurrency]);

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
      <Card>
        <CardHeader>
          <CardTitle>My Holdings</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-10 w-10 rounded" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-20" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
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
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredHoldings.length === 0 && search && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    No holdings match &ldquo;{search}&rdquo;
                  </td>
                </tr>
              )}
              {filteredHoldings.map((holding) => {
                const isPositive = (holding.dayChangePercent ?? 0) >= 0;
                const plIsPositive = (holding.unrealizedPLPercent ?? 0) >= 0;
                const dayChangeColor = isPositive
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400';
                const plColor = plIsPositive
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400';

                return (
                  <tr
                    key={holding.id}
                    className="border-b border-border/50 hover:bg-muted/30 transition-colors"
                  >
                    <td className="py-4 px-4">
                      <Link
                        href={`/stock/${holding.symbol}`}
                        className="flex items-center gap-3 group"
                      >
                        <CompanyLogo
                          name={holding.company_name}
                          ticker={holding.symbol}
                          logoUrl={holding.logoUrl || null}
                          size={48}
                        />
                        <div>
                          <div className="font-medium text-foreground group-hover:underline">
                            {holding.symbol}
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
                      {holding.currentPrice !== undefined 
                        ? formatCurrencyValue(holding.currentPrice, userCurrency || 'USD', roundNumbers ? { round: true } : undefined) 
                        : '—'}
                    </td>
                    <td className="py-4 px-4">
                      {holding.dayChangePercent !== undefined ? (
                        <div className={`flex items-center gap-1 ${dayChangeColor}`}>
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
                      {holding.marketValue !== undefined 
                        ? formatCurrencyValue(holding.marketValue, userCurrency || 'USD', roundNumbers ? { round: true } : undefined) 
                        : '—'}
                    </td>
                    <td className="py-4 px-4">
                      {holding.unrealizedPL !== undefined ? (
                        <div className={`${plColor}`}>
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
                    <td className="py-4 px-4 text-sm text-foreground">
                      {holding.allocation !== undefined
                        ? `${holding.allocation.toFixed(roundNumbers ? 0 : 1)}%`
                        : '—'}
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(holding)}
                          disabled={removeHolding.isPending}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveClick(holding)}
                          disabled={removeHolding.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {onAddClick && (
                <tr>
                  <td colSpan={9} className="p-0 align-middle">
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
  );
}
