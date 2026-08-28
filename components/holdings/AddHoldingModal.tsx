'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
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
import { DatePicker } from '@/components/ui/date-picker';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useAddHolding, useAddOrUpdateHolding } from '@/hooks/use-holdings';
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
  /** ISO 4217 listing currency from symbol search (e.g. USD, NOK, EUR). */
  currency?: string;
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
  const { t } = useTranslation('holdings');
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStock, setSelectedStock] = useState<SearchResult | null>(null);
  const [mode, setMode] = useState<'single' | 'multiple'>('single');
  const [quantity, setQuantity] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [datePurchased, setDatePurchased] = useState('');
  const [quantityError, setQuantityError] = useState('');
  const [avgPriceError, setAvgPriceError] = useState('');
  interface PurchaseRow {
    quantity: string;
    price: string;
    date: string;
  }
  const [purchaseRows, setPurchaseRows] = useState<PurchaseRow[]>([{ quantity: '', price: '', date: '' }]);
  const [multiError, setMultiError] = useState('');
  const addOrUpdateHolding = useAddOrUpdateHolding();

  const addPurchaseRow = () => setPurchaseRows((rows) => [...rows, { quantity: '', price: '', date: '' }]);
  const removePurchaseRow = (index: number) => setPurchaseRows((rows) => rows.filter((_, i) => i !== index));
  const updatePurchaseRow = (index: number, field: keyof PurchaseRow, value: string) =>
    setPurchaseRows((rows) => rows.map((row, i) => (i === index ? { ...row, [field]: value } : row)));

  const multiTotals = useMemo(() => {
    let totalQty = 0;
    let totalCost = 0;
    for (const row of purchaseRows) {
      const q = parseFloat(row.quantity) || 0;
      const p = parseFloat(row.price) || 0;
      totalQty += q;
      totalCost += q * p;
    }
    return { totalQty, avgPrice: totalQty > 0 ? totalCost / totalQty : 0 };
  }, [purchaseRows]);

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
    if (isNaN(n) || n <= 0) return t('addHoldingQuantityError');
    return '';
  };

  const validateAvgPrice = (val: string) => {
    if (!val) return '';
    const n = parseFloat(val);
    if (isNaN(n) || n <= 0) return t('addHoldingPriceError');
    return '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedStock) return;

    const assetType = inferAssetType(selectedStock.ticker, selectedStock.instrument_type);

    if (mode === 'multiple') {
      setMultiError('');
      for (const row of purchaseRows) {
        const q = parseFloat(row.quantity) || 0;
        const p = parseFloat(row.price) || 0;
        if (q <= 0 || p <= 0 || !row.date) {
          setMultiError(t('addHoldingMultiRowError'));
          return;
        }
      }

      try {
        for (const row of purchaseRows) {
          const input: AddHoldingInput = {
            symbol: selectedStock.ticker,
            company_name: selectedStock.name,
            quantity: parseFloat(row.quantity),
            avg_price: parseFloat(row.price),
            date_purchased: row.date,
            asset_type: assetType === 'unknown' ? 'stock' : assetType,
            purchase_currency: userCurrency,
            purchase_fx_rate: userCurrency !== 'USD' ? null : 1,
            trading_currency: selectedStock.currency ?? null,
          };
          // Sequential, not Promise.all — the first call creates the holding,
          // every later call must see it already exist to merge into it.
          await addOrUpdateHolding.mutateAsync(input);
        }

        setSelectedStock(null);
        setSearchQuery('');
        setPurchaseRows([{ quantity: '', price: '', date: '' }]);
        onOpenChange(false);
      } catch (error) {
        console.error('Error adding holding (multiple purchases):', error);
      }
      return;
    }

    // Run validation before submitting
    const qErr = validateQuantity(quantity);
    const pErr = validateAvgPrice(avgPrice);
    setQuantityError(qErr);
    setAvgPriceError(pErr);
    if (qErr || pErr) return;

    try {
      const input: AddHoldingInput = {
        symbol: selectedStock.ticker,
        company_name: selectedStock.name,
        quantity: quantity ? parseFloat(quantity) : null,
        avg_price: avgPrice ? parseFloat(avgPrice) : null,
        date_purchased: datePurchased || null,
        asset_type: assetType === 'unknown' ? 'stock' : assetType,
        purchase_currency: userCurrency,
        purchase_fx_rate: historicalRateData ?? (userCurrency !== 'USD' ? null : 1),
        // The asset's listing currency — what avg_price is denominated in (USD/NOK/EUR…).
        trading_currency: selectedStock.currency ?? null,
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
    setMode('single');
    setPurchaseRows([{ quantity: '', price: '', date: '' }]);
    setMultiError('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('addHoldingTitle')}</DialogTitle>
          <DialogDescription>
            {t('addHoldingDescription')}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Stock Search */}
          <div className="space-y-2">
            <Label htmlFor="stock-search">{t('addHoldingStockLabel')}</Label>
            <div className="relative">
              <Command className="rounded-lg border">
                <CommandInput
                  id="stock-search"
                  placeholder={t('addHoldingSearchPlaceholder')}
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                />
                <CommandList>
                  {isSearching && (
                    <div className="p-4 text-center text-sm text-muted-foreground">
                      {t('addHoldingSearching')}
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
                      <CommandEmpty>{t('addHoldingNoStocksFound')}</CommandEmpty>
                    )}
                </CommandList>
              </Command>
            </div>
            {selectedStock && (
              <div className="text-xs text-muted-foreground">
                {t('addHoldingSelected', { ticker: selectedStock.ticker, name: selectedStock.name })}
              </div>
            )}
          </div>

          <Tabs value={mode} onValueChange={(v) => setMode(v as 'single' | 'multiple')}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="single">{t('addHoldingSinglePurchase')}</TabsTrigger>
              <TabsTrigger value="multiple">{t('addHoldingMultiplePurchases')}</TabsTrigger>
            </TabsList>

            <TabsContent value="single" className="space-y-6 pt-4">
              {/* Quantity (Optional) */}
              <div className="space-y-2">
                <Label htmlFor="quantity">{t('addHoldingQuantityLabel')}</Label>
                <Input
                  id="quantity"
                  type="number"
                  step="0.01"
                  placeholder={t('addHoldingQuantityPlaceholder')}
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
                <Label htmlFor="avg-price">{t('addHoldingAvgPriceLabel')}</Label>
                <Input
                  id="avg-price"
                  type="number"
                  step="0.01"
                  placeholder={t('addHoldingAvgPricePlaceholder')}
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
                <Label htmlFor="date-purchased">{t('addHoldingDateLabel')}</Label>
                <DatePicker
                  id="date-purchased"
                  max={new Date().toISOString().slice(0, 10)}
                  value={datePurchased}
                  onChange={setDatePurchased}
                  placeholder={t('addHoldingDatePlaceholder')}
                />
                {datePurchased && userCurrency !== 'USD' ? (
                  <p className="text-xs text-muted-foreground">
                    {historicalRateData
                      ? t('addHoldingFxRateNote', { date: datePurchased, rate: historicalRateData.toFixed(4), currency: userCurrency })
                      : t('addHoldingFxRateLoading', { currency: userCurrency, date: datePurchased })}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {t('editHoldingDateHint')}
                  </p>
                )}
              </div>
            </TabsContent>

            <TabsContent value="multiple" className="space-y-4 pt-4">
              {purchaseRows.map((row, i) => (
                <div key={i} className="space-y-2 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs text-muted-foreground">{t('addHoldingPurchaseRowLabel', { n: i + 1 })}</Label>
                    {purchaseRows.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removePurchaseRow(i)}
                        className="text-xs text-muted-foreground hover:text-destructive"
                      >
                        {t('addHoldingRemoveRow')}
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={t('addHoldingSharesPlaceholder')}
                      value={row.quantity}
                      onChange={(e) => updatePurchaseRow(i, 'quantity', e.target.value)}
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={t('addHoldingPricePlaceholder')}
                      value={row.price}
                      onChange={(e) => updatePurchaseRow(i, 'price', e.target.value)}
                    />
                    <DatePicker
                      max={new Date().toISOString().slice(0, 10)}
                      value={row.date}
                      onChange={(v) => updatePurchaseRow(i, 'date', v)}
                      placeholder={t('addHoldingDatePlaceholderShort')}
                    />
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addPurchaseRow}
                className="w-full rounded-lg border border-dashed border-border/60 py-2 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary"
              >
                {t('addHoldingAddAnotherPurchase')}
              </button>
              {multiTotals.totalQty > 0 && (
                <p className="text-sm text-muted-foreground">
                  {t('addHoldingMultiTotal', { qty: multiTotals.totalQty, avgPrice: multiTotals.avgPrice.toFixed(2) })}
                </p>
              )}
              {multiError && <p className="text-xs text-destructive">{multiError}</p>}
            </TabsContent>
          </Tabs>

          {/* Submit Button */}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose}>
              {t('addHoldingCancel')}
            </Button>
            <Button
              type="submit"
              disabled={!selectedStock || addHolding.isPending || addOrUpdateHolding.isPending}
            >
              {(mode === 'multiple' ? addOrUpdateHolding.isPending : addHolding.isPending) ? t('addHoldingAdding') : t('addHoldingTitle')}
            </Button>
          </div>

          {addHolding.isError && (
            <div className="text-sm text-red-600 dark:text-red-400">
              {addHolding.error instanceof Error
                ? addHolding.error.message
                : t('addHoldingGenericError')}
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
