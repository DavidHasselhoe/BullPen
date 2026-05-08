'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useAddHolding } from '@/hooks/use-holdings';
import { useAuth } from '@/hooks/use-auth';
import { CheckCircle2 } from 'lucide-react';
import type { AddHoldingInput } from '@/app/actions/holdings';
import { inferAssetType } from '@/lib/assets/asset-type';
import type { CurrencyCode } from '@/lib/currency/currency-conversion';

interface SearchResult {
  ticker: string;
  name: string;
  exchange?: string;
  instrument_type?: string;
  cik: string;
  has_data: boolean;
  logo_url?: string | null;
}

interface SearchResponse {
  success: boolean;
  results?: SearchResult[];
  error?: string;
}

interface AddHoldingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function AddHoldingModal({ open, onOpenChange }: AddHoldingModalProps) {
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStock, setSelectedStock] = useState<SearchResult | null>(null);
  const [quantity, setQuantity] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [datePurchased, setDatePurchased] = useState('');
  const [quantityError, setQuantityError] = useState('');
  const [avgPriceError, setAvgPriceError] = useState('');

  // Derive user's home currency from settings
  const userCurrency = useMemo((): CurrencyCode => {
    const settings = (user?.settings as Record<string, unknown>) ?? {};
    const c = settings.default_currency as string | undefined;
    if (!c || c === 'exchange') return 'USD';
    return c as CurrencyCode;
  }, [user]);

  // Simple debounce implementation
  const [debouncedQuery, setDebouncedQuery] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);
  const addHolding = useAddHolding();

  // Fetch historical USD→userCurrency rate for the purchase date
  const { data: historicalRateData } = useQuery({
    queryKey: ['historical-fx', datePurchased, userCurrency],
    queryFn: async () => {
      const res = await fetch(`/api/currency/rates/historical?date=${datePurchased}`);
      if (!res.ok) return null;
      const data = await res.json();
      const rate = data.rates?.[userCurrency] as number | undefined;
      return rate ?? null;
    },
    enabled: !!datePurchased && userCurrency !== 'USD',
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
  });

  // Search query
  const {
    data: searchResults,
    isLoading: isSearching,
  } = useQuery({
    queryKey: ['stock-search', debouncedQuery],
    queryFn: async (): Promise<SearchResult[]> => {
      if (!debouncedQuery || debouncedQuery.trim().length < 2) {
        return [];
      }

      const response = await fetch(`/api/search?q=${encodeURIComponent(debouncedQuery)}`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Search failed: ${response.status}`);
      }

      const data: SearchResponse = await response.json();

      if (data.success && data.results) {
        return data.results;
      }

      if (!data.success) {
        throw new Error(data.error || 'Search failed');
      }

      return [];
    },
    enabled: debouncedQuery.trim().length >= 2 && open,
    staleTime: 30 * 1000,
    retry: false,
  });

  const handleSelect = useCallback(
    (result: SearchResult) => {
      setSelectedStock(result);
      setSearchQuery(result.name);
    },
    []
  );

  const validateQuantity = (val: string) => {
    if (!val) return '';
    const n = parseFloat(val);
    if (isNaN(n) || n <= 0) return 'Quantity must be greater than 0';
    return '';
  };

  const validateAvgPrice = (val: string) => {
    if (!val) return '';
    const n = parseFloat(val);
    if (isNaN(n) || n <= 0) return 'Price must be greater than 0';
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedStock) return;

    // Run validation before submitting
    const qErr = validateQuantity(quantity);
    const pErr = validateAvgPrice(avgPrice);
    setQuantityError(qErr);
    setAvgPriceError(pErr);
    if (qErr || pErr) return;

    try {
      const assetType = inferAssetType(selectedStock.ticker, selectedStock.instrument_type);
      const input: AddHoldingInput = {
        symbol: selectedStock.ticker,
        company_name: selectedStock.name,
        quantity: quantity ? parseFloat(quantity) : null,
        avg_price: avgPrice ? parseFloat(avgPrice) : null,
        date_purchased: datePurchased || null,
        asset_type: assetType === 'unknown' ? 'stock' : assetType,
        purchase_currency: userCurrency,
        purchase_fx_rate: historicalRateData ?? (userCurrency !== 'USD' ? null : 1),
      };

      await addHolding.mutateAsync(input);

      // Reset form
      setSelectedStock(null);
      setSearchQuery('');
      setQuantity('');
      setAvgPrice('');
      setDatePurchased('');
      onOpenChange(false);
    } catch (error) {
      console.error('Error adding holding:', error);
      // Error is handled by the mutation
    }
  };

  const handleClose = () => {
    setSelectedStock(null);
    setSearchQuery('');
    setQuantity('');
    setAvgPrice('');
    setDatePurchased('');
    setQuantityError('');
    setAvgPriceError('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Add Holding</DialogTitle>
          <DialogDescription>
            Search for a stock and optionally add quantity and average price.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Stock Search */}
          <div className="space-y-2">
            <Label htmlFor="stock-search">Stock</Label>
            <div className="relative">
              <Command className="rounded-lg border">
                <CommandInput
                  id="stock-search"
                  placeholder="Search by ticker or company name..."
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList>
                  {isSearching && (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      Searching...
                    </div>
                  )}
                  {!isSearching && searchResults && searchResults.length > 0 && (
                    <CommandGroup>
                      {searchResults.map((result) => (
                        <CommandItem
                          key={result.ticker}
                          value={`${result.ticker} ${result.name}`}
                          onSelect={() => handleSelect(result)}
                          className="flex items-center gap-3"
                        >
                          <CompanyLogo
                            name={result.name}
                            ticker={result.ticker}
                            logoUrl={result.logo_url || null}
                            size={40}
                          />
                          <div className="flex-1">
                            <div className="font-medium">{result.ticker}</div>
                            <div className="text-xs text-muted-foreground">{result.name}</div>
                          </div>
                          {selectedStock?.ticker === result.ticker && (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {!isSearching &&
                    debouncedQuery.trim().length >= 2 &&
                    searchResults &&
                    searchResults.length === 0 && (
                      <CommandEmpty>No stocks found.</CommandEmpty>
                    )}
                </CommandList>
              </Command>
            </div>
            {selectedStock && (
              <div className="text-xs text-muted-foreground">
                Selected: {selectedStock.ticker} - {selectedStock.name}
              </div>
            )}
          </div>

          {/* Quantity (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity (Optional)</Label>
            <Input
              id="quantity"
              type="number"
              step="0.01"
              placeholder="e.g., 10"
              value={quantity}
              onChange={(e) => {
                setQuantity(e.target.value);
                if (quantityError) setQuantityError(validateQuantity(e.target.value));
              }}
              onBlur={(e) => setQuantityError(validateQuantity(e.target.value))}
              aria-invalid={!!quantityError}
              className={quantityError ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
            {quantityError && (
              <p className="text-xs text-destructive">{quantityError}</p>
            )}
          </div>

          {/* Average Price (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="avg-price">Average Price (Optional)</Label>
            <Input
              id="avg-price"
              type="number"
              step="0.01"
              placeholder="e.g., 150.00"
              value={avgPrice}
              onChange={(e) => {
                setAvgPrice(e.target.value);
                if (avgPriceError) setAvgPriceError(validateAvgPrice(e.target.value));
              }}
              onBlur={(e) => setAvgPriceError(validateAvgPrice(e.target.value))}
              aria-invalid={!!avgPriceError}
              className={avgPriceError ? 'border-destructive focus-visible:ring-destructive' : ''}
            />
            {avgPriceError && (
              <p className="text-xs text-destructive">{avgPriceError}</p>
            )}
          </div>

          {/* Date Purchased (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="date-purchased">Date Purchased (Optional)</Label>
            <Input
              id="date-purchased"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={datePurchased}
              onChange={(e) => setDatePurchased(e.target.value)}
            />
            {datePurchased && userCurrency !== 'USD' ? (
              <p className="text-xs text-muted-foreground">
                {historicalRateData
                  ? `Rate on ${datePurchased}: 1 USD = ${historicalRateData.toFixed(4)} ${userCurrency} — used for FX-adjusted P/L`
                  : `Looking up USD/${userCurrency} rate for ${datePurchased}…`}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground">
                Used to chart your P/L from the day you opened this position.
              </p>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!selectedStock || addHolding.isPending}
            >
              {addHolding.isPending ? 'Adding...' : 'Add Holding'}
            </Button>
          </div>

          {addHolding.isError && (
            <div className="text-sm text-red-600 dark:text-red-400">
              {addHolding.error instanceof Error
                ? addHolding.error.message
                : 'Failed to add holding'}
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
