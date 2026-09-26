'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useInstantSearch } from '@/hooks/use-symbol-index';
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
import { inferAssetType, fundLabel } from '@/lib/assets/asset-type';
import type { CurrencyCode } from '@/lib/currency/currency-conversion';
import { CashOption, useCashPayment } from './CashOption';

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

function TypePill({ label }: { label: string }) {
  return (
    <span className="rounded border border-border px-1.5 text-xs leading-4 text-muted-foreground">{label}</span>
  );
}

interface AddHoldingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * A symbol the reader already chose somewhere else (a built portfolio, a
   * screener row), so they land on the quantity field instead of retyping a
   * ticker they just clicked.
   */
  initialTicker?: string;
}

export function AddHoldingModal({ open, onOpenChange, initialTicker }: AddHoldingModalProps) {
  const { t } = useTranslation('holdings');
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState(initialTicker ?? '');
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
  const cash = useCashPayment(open);
  // Set when the holding saved but the cash update failed: blocks a resubmit that would add it twice.
  const [cashError, setCashError] = useState(false);

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

  // Local catalogue answers on the keystroke; the server fills in the rest.
  const { results: searchResults, isLoading: isSearching } = useInstantSearch(searchQuery, 8);

  // True while someone reopened the search to swap what they picked. The query
  // is left as they typed it, so "Change" puts them back in the same results.
  const [picking, setPicking] = useState(false);

  const handleSelect = useCallback((result: SearchResult) => {
    setSelectedStock(result);
    setPicking(false);
  }, []);

  /** Stocks need no label; everything else says what it is, so "NVIDIA" and a 2x NVIDIA ETF never look alike. */
  const typeLabel = (r: SearchResult): string | null => {
    const type = inferAssetType(r.ticker, r.instrument_type);
    if (type === 'crypto') return t('addHoldingTypeCrypto');
    // Just "Fund": the server search returns every kind of mutual fund
    // (BHNCOXX is a structured note), so "Index fund" was only true locally.
    if (r.instrument_type === 'Mutual Fund') return t('addHoldingTypeFund');
    if (type === 'etf') return fundLabel(r.instrument_type);
    return null;
  };

  /**
   * Opened on a ticker the reader already picked somewhere else: the search
   * box starts on that symbol, and the exact catalogue match stands in as the
   * selection until they choose something else themselves.
   *
   * Derived rather than assigned in an effect, so nothing has to race the
   * search results to set it. Resolving through the same search path as a
   * typed symbol is what keeps the company name, listing currency and
   * instrument type right; a hand-built result would be guessing them.
   */
  const prefilled = useMemo(() => {
    if (!initialTicker) return null;
    return searchResults?.find((r) => r.ticker.toUpperCase() === initialTicker.toUpperCase()) ?? null;
  }, [initialTicker, searchResults]);
  const activeStock = selectedStock ?? prefilled;
  const activeKind = activeStock ? typeLabel(activeStock) : null;
  const showPicker = !activeStock || picking;
  const tradeCurrency = activeStock?.currency ?? 'USD';
  // Only what the form states a price for moves cash; a position added without an avg price costs nothing.
  const tradeCost =
    mode === 'multiple'
      ? multiTotals.totalQty * multiTotals.avgPrice
      : (parseFloat(quantity) || 0) * (parseFloat(avgPrice) || 0);

  /** Moves cash after a saved add. False when that failed and the modal must stay open to say so. */
  const settleCash = async () => {
    try {
      await cash.settle('buy', tradeCost, tradeCurrency);
      return true;
    } catch (error) {
      console.error('Error updating cash after adding holding:', error);
      setCashError(true);
      return false;
    }
  };

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

    // Enter in the search box selects a result; it must never submit mid-pick.
    if (!activeStock || showPicker) return;

    const assetType = inferAssetType(activeStock.ticker, activeStock.instrument_type);

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
            symbol: activeStock.ticker,
            company_name: activeStock.name,
            quantity: parseFloat(row.quantity),
            avg_price: parseFloat(row.price),
            date_purchased: row.date,
            asset_type: assetType === 'unknown' ? 'stock' : assetType,
            purchase_currency: userCurrency,
            purchase_fx_rate: userCurrency !== 'USD' ? null : 1,
            trading_currency: activeStock.currency ?? null,
          };
          // Sequential, not Promise.all — the first call creates the holding,
          // every later call must see it already exist to merge into it.
          await addOrUpdateHolding.mutateAsync(input);
        }
        if (!(await settleCash())) return;

        setSelectedStock(null);
        setSearchQuery('');
        setPurchaseRows([{ quantity: '', price: '', date: '' }]);
        handleClose();
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
        symbol: activeStock.ticker,
        company_name: activeStock.name,
        quantity: quantity ? parseFloat(quantity) : null,
        avg_price: avgPrice ? parseFloat(avgPrice) : null,
        date_purchased: datePurchased || null,
        asset_type: assetType === 'unknown' ? 'stock' : assetType,
        purchase_currency: userCurrency,
        purchase_fx_rate: historicalRateData ?? (userCurrency !== 'USD' ? null : 1),
        // The asset's listing currency — what avg_price is denominated in (USD/NOK/EUR…).
        trading_currency: activeStock.currency ?? null,
      };

      await addHolding.mutateAsync(input);
      if (!(await settleCash())) return;

      // Reset form
      setSelectedStock(null);
      setSearchQuery('');
      setQuantity('');
      setAvgPrice('');
      setDatePurchased('');
      handleClose();
    } catch (error) {
      console.error('Error adding holding:', error);
      // Error is handled by the mutation
    }
  };

  const handleClose = () => {
    setSelectedStock(null);
    setPicking(false);
    setSearchQuery('');
    setQuantity('');
    setAvgPrice('');
    setDatePurchased('');
    setQuantityError('');
    setAvgPriceError('');
    setMode('single');
    setPurchaseRows([{ quantity: '', price: '', date: '' }]);
    setMultiError('');
    setCashError(false);
    cash.setEnabled(false);
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

        {/* min-w-0: the dialog is a grid, and without it a long one-line
            company name widened the form past the dialog's own edge. */}
        <form onSubmit={handleSubmit} className="min-w-0 space-y-6">
          {/* What was bought: a search until something is picked, then a card */}
          <div className="space-y-2">
            {/* No htmlFor: cmdk replaces the input's id with its own, so the
                accessible name comes from Command's `label` below instead. */}
            <Label>{t('addHoldingStockLabel')}</Label>
            {showPicker ? (
              // shouldFilter={false}: cmdk otherwise re-filters and re-sorts the
              // list with its own fuzzy score, which threw away our ranking and
              // put "PurePlay Nvidia Ecosystem ETF" above NVIDIA for "nvidia".
              <Command shouldFilter={false} label={t('addHoldingStockLabel')} className="rounded-lg border">
                <CommandInput
                  placeholder={t('addHoldingSearchPlaceholder')}
                  value={searchQuery}
                  onValueChange={setSearchQuery}
                  autoFocus={picking}
                />
                {/* Fixed height, like the command palette: the dialog kept
                    resizing as the number of results changed under the cursor. */}
                <CommandList className="h-[288px] max-h-[288px]">
                  {searchQuery.trim().length === 0 ? (
                    <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                      {t('addHoldingSearchHint')}
                    </p>
                  ) : isSearching ? (
                    <p className="px-4 py-10 text-center text-sm text-muted-foreground">
                      {t('addHoldingSearching')}
                    </p>
                  ) : searchResults.length > 0 ? (
                    <CommandGroup>
                      {searchResults.map((result) => {
                        const kind = typeLabel(result);
                        const isActive = activeStock?.ticker === result.ticker;
                        return (
                          <CommandItem
                            key={result.ticker}
                            value={result.ticker}
                            onSelect={() => handleSelect(result)}
                            className="flex items-center gap-3 py-2"
                          >
                            <CompanyLogo
                              name={result.name}
                              ticker={result.ticker}
                              logoUrl={result.logo_url || null}
                              size={32}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{result.ticker}</span>
                                {kind && <TypePill label={kind} />}
                              </div>
                              {/* clamp-ok: a company name is a short label; full name on hover. */}
                              <div className="truncate text-xs text-muted-foreground" title={result.name}>
                                {result.name}
                              </div>
                            </div>
                            {isActive && <CheckCircle2 className="h-4 w-4 shrink-0 text-foreground" aria-hidden />}
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  ) : debouncedQuery.trim().length >= 2 ? (
                    <CommandEmpty>{t('addHoldingNoStocksFound')}</CommandEmpty>
                  ) : null}
                </CommandList>
                {picking && activeStock && (
                  <div className="flex justify-end border-t px-2 py-1.5">
                    <Button type="button" variant="ghost" size="sm" onClick={() => setPicking(false)}>
                      {t('addHoldingKeep', { ticker: activeStock.ticker })}
                    </Button>
                  </div>
                )}
              </Command>
            ) : (
              activeStock && (
                <div className="flex items-center gap-3 rounded-lg border border-foreground/20 bg-muted/40 px-3 py-2.5">
                  <CompanyLogo
                    name={activeStock.name}
                    ticker={activeStock.ticker}
                    logoUrl={activeStock.logo_url || null}
                    size={40}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold">{activeStock.ticker}</span>
                      {activeKind && <TypePill label={activeKind} />}
                    </div>
                    {/* clamp-ok: company name label; full name on hover. */}
                    <div className="truncate text-sm text-muted-foreground" title={activeStock.name}>
                      {activeStock.name}
                    </div>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => setPicking(true)}>
                    {t('addHoldingChange')}
                  </Button>
                </div>
              )
            )}
          </div>

          {/* Details only once something is picked: one step at a time, and the
              dialog no longer stacks a 288px result list on top of a full form. */}
          {!showPicker && (<>
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

          <CashOption payment={cash} mode="buy" amount={tradeCost} currency={tradeCurrency} />
          </>)}

          {/* Submit Button */}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose}>
              {t('addHoldingCancel')}
            </Button>
            <Button
              type="submit"
              disabled={showPicker || addHolding.isPending || addOrUpdateHolding.isPending || cashError}
            >
              {(mode === 'multiple' ? addOrUpdateHolding.isPending : addHolding.isPending) ? t('addHoldingAdding') : t('addHoldingTitle')}
            </Button>
          </div>

          {cashError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t('cashOptionSettleError')}</p>
          )}

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
