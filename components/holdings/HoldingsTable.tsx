'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useHoldings, useRemoveHolding } from '@/hooks/use-holdings';
import { Trash2, Edit2, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { createBrowserClient } from '@/lib/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { EditHoldingModal } from './EditHoldingModal';
import { DeleteHoldingDialog } from './DeleteHoldingDialog';
import type { HoldingWithPrice } from './types';
import type { UserHolding } from '@/lib/types/database';

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

function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
}

export function HoldingsTable() {
  const { data: holdings, isLoading } = useHoldings();
  const removeHolding = useRemoveHolding();
  const [sortBy, setSortBy] = useState<'marketValue' | 'symbol' | 'allocation'>('marketValue');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [editingHolding, setEditingHolding] = useState<UserHolding | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deletingHolding, setDeletingHolding] = useState<{ id: string; symbol: string; companyName: string } | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);

  // Fetch quotes for all holdings in parallel
  const quotes = useQuery({
    queryKey: ['holdings-quotes', holdings?.map((h) => h.symbol)],
    queryFn: async () => {
      if (!holdings || holdings.length === 0) return {};
      
      const supabase = createBrowserClient();
      const quoteMap: Record<string, { price: number; change: number; changePercent: number }> = {};
      
      // Fetch company info for logos from storage bucket
      const companyPromises = holdings.map(async (holding) => {
        // Try to get logo from companies table first
        const { data: company } = await supabase
          .from('companies')
          .select('logo_url')
          .eq('ticker', holding.symbol)
          .maybeSingle();
        
        let logoUrl = company?.logo_url || null;
        
        // If no logo_url in DB or it's null/empty, try to construct URL from storage bucket
        // Try multiple extensions since logos might be .png, .jpg, or .svg
        if (!logoUrl) {
          const extensions = ['jpg', 'png', 'svg'];
          for (const ext of extensions) {
            const { data: urlData } = supabase.storage
              .from('company-logos')
              .getPublicUrl(`${holding.symbol.toLowerCase()}.${ext}`);
            // getPublicUrl always returns a URL, but we'll use it anyway
            // The image component will handle 404s gracefully
            logoUrl = urlData?.publicUrl || null;
            if (logoUrl) break;
          }
        }
        
        return { symbol: holding.symbol, logoUrl };
      });
      
      const companies = await Promise.all(companyPromises);
      const logoMap: Record<string, string | null> = {};
      companies.forEach((c) => {
        logoMap[c.symbol] = c.logoUrl;
      });

      // Fetch quotes
      const quotePromises = holdings.map(async (holding) => {
        try {
          const response = await fetch(`/api/stock/${holding.symbol}/quote`);
          const data = await response.json();
          if (data.success && data.quote && data.quote.c > 0) {
            quoteMap[holding.symbol] = {
              price: data.quote.c,
              change: data.quote.d,
              changePercent: data.quote.dp,
            };
          }
        } catch (error) {
          console.error(`Error fetching quote for ${holding.symbol}:`, error);
        }
      });

      await Promise.all(quotePromises);
      
      return { quotes: quoteMap, logos: logoMap };
    },
    enabled: !!holdings && holdings.length > 0,
    staleTime: 2 * 60 * 1000, // 2 minutes - quotes don't change that frequently
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
  });

  // Combine holdings with quotes and calculate derived values
  const holdingsWithPrices = useMemo((): HoldingWithPrice[] => {
    if (!holdings) return [];
    
    const quotesMap = quotes.data?.quotes || {};
    const logosMap = quotes.data?.logos || {};
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
      
      const currentPrice = quote?.price;
      const dayChange = quote?.change;
      const dayChangePercent = quote?.changePercent;
      
      const marketValue = currentPrice && holding.quantity
        ? currentPrice * holding.quantity
        : undefined;
      
      const unrealizedPL = currentPrice && holding.avg_price && holding.quantity
        ? (currentPrice - holding.avg_price) * holding.quantity
        : undefined;
      
      const unrealizedPLPercent = currentPrice && holding.avg_price
        ? ((currentPrice - holding.avg_price) / holding.avg_price) * 100
        : undefined;
      
      const allocation = marketValue && totalMarketValue > 0
        ? (marketValue / totalMarketValue) * 100
        : undefined;

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
      };
    });
  }, [holdings, quotes.data]);

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
      console.error('Error removing holding:', error);
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
        <CardContent>
          <p className="text-sm text-muted-foreground text-center py-8">
            No holdings yet. Add your first stock to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>My Holdings</CardTitle>
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
              {sortedHoldings.map((holding) => {
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
                      {holding.quantity !== null ? formatNumber(holding.quantity) : '—'}
                    </td>
                    <td className="py-4 px-4 text-sm text-foreground">
                      {holding.avg_price !== null ? formatCurrency(holding.avg_price) : '—'}
                    </td>
                    <td className="py-4 px-4 text-sm font-medium text-foreground">
                      {holding.currentPrice ? formatCurrency(holding.currentPrice) : '—'}
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
                            {formatPercent(holding.dayChangePercent)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-sm font-medium text-foreground">
                      {holding.marketValue ? formatCurrency(holding.marketValue) : '—'}
                    </td>
                    <td className="py-4 px-4">
                      {holding.unrealizedPL !== undefined ? (
                        <div className={`${plColor}`}>
                          <div className="text-sm font-medium">
                            {formatCurrency(holding.unrealizedPL)}
                          </div>
                          {holding.unrealizedPLPercent !== undefined && (
                            <div className="text-xs">
                              {formatPercent(holding.unrealizedPLPercent)}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="py-4 px-4 text-sm text-foreground">
                      {holding.allocation !== undefined
                        ? `${holding.allocation.toFixed(1)}%`
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
