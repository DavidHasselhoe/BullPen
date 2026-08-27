'use client';

import { useEffect, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Check } from 'lucide-react';
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
import { useAddOrUpdateHolding } from '@/hooks/use-holdings';
import { useAuth } from '@/hooks/use-auth';
import type { UserHolding } from '@/lib/types/database';
import type { CurrencyCode } from '@/lib/currency/currency-conversion';
import { logger } from '@/lib/utils/logger';

interface AddPurchaseModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holding: UserHolding | null;
  /** Live market price in USD, if available — prefills the purchase price field. */
  currentPriceUSD?: number;
}

export function AddPurchaseModal({ open, onOpenChange, holding, currentPriceUSD }: AddPurchaseModalProps) {
  const { t } = useTranslation('holdings');
  const { user } = useAuth();
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10));
  const [saved, setSaved] = useState(false);
  const addOrUpdateHolding = useAddOrUpdateHolding();

  const userCurrency = useMemo((): CurrencyCode => {
    const settings = (user?.settings as Record<string, unknown>) ?? {};
    const c = settings.default_currency as string | undefined;
    if (!c || c === 'exchange') return 'USD';
    return c as CurrencyCode;
  }, [user]);

  const { data: historicalRateData } = useQuery({
    queryKey: ['historical-fx', purchaseDate, userCurrency],
    queryFn: async () => {
      const res = await fetch(`/api/currency/rates/historical?date=${purchaseDate}`);
      if (!res.ok) return null;
      const data = await res.json();
      const rate = data.rates?.[userCurrency] as number | undefined;
      return rate ?? null;
    },
    enabled: !!purchaseDate && userCurrency !== 'USD' && open,
    staleTime: 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
  });

  useEffect(() => {
    // Same deliberate omission of currentPriceUSD from deps as SellHoldingModal:
    // this page has a live price feed, so currentPriceUSD ticks every few
    // seconds while the modal is open. Populate once per open+holding only.
    if (holding && open) {
      setQuantity('');
      setPrice(currentPriceUSD != null ? String(currentPriceUSD) : '');
      setPurchaseDate(new Date().toISOString().slice(0, 10));
      setSaved(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentPriceUSD intentionally excluded, see comment above
  }, [holding, open]);

  if (!holding) return null;

  const heldQty = holding.quantity ?? 0;
  const qtyNum = parseFloat(quantity) || 0;
  const priceNum = parseFloat(price) || 0;
  const newQuantity = heldQty + qtyNum;
  const newAvgPrice =
    qtyNum > 0 && priceNum > 0
      ? holding.avg_price != null && heldQty > 0
        ? (heldQty * holding.avg_price + qtyNum * priceNum) / newQuantity
        : priceNum
      : holding.avg_price;
  const canSubmit = qtyNum > 0 && priceNum > 0 && !!purchaseDate;

  const handleClose = () => {
    setQuantity('');
    setSaved(false);
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      await addOrUpdateHolding.mutateAsync({
        symbol: holding.symbol,
        company_name: holding.company_name,
        quantity: qtyNum,
        avg_price: priceNum,
        date_purchased: purchaseDate,
        asset_type: holding.asset_type,
        purchase_currency: userCurrency,
        purchase_fx_rate: historicalRateData ?? (userCurrency !== 'USD' ? null : 1),
        trading_currency: holding.trading_currency,
      });
      setSaved(true);
      setTimeout(handleClose, 1000);
    } catch (error) {
      logger.error('Error adding purchase', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('addPurchaseTitle', { symbol: holding.symbol })}</DialogTitle>
          <DialogDescription>
            {t('addPurchaseDescription', {
              heldQty,
              companyName: holding.company_name,
              avgPrice: holding.avg_price != null ? `$${holding.avg_price.toFixed(2)}` : '—',
            })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="purchase-quantity">{t('addPurchaseSharesLabel')}</Label>
            <Input
              id="purchase-quantity"
              type="number"
              step="0.000001"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchase-price">{t('addPurchasePriceLabel')}</Label>
            <Input
              id="purchase-price"
              type="number"
              step="0.01"
              min="0"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="purchase-date">{t('addPurchaseDateLabel')}</Label>
            <DatePicker
              id="purchase-date"
              max={new Date().toISOString().slice(0, 10)}
              value={purchaseDate}
              onChange={setPurchaseDate}
            />
          </div>

          {qtyNum > 0 && priceNum > 0 && (
            <p className="text-sm text-muted-foreground">
              {t('addPurchaseNewPosition', { quantity: newQuantity, avgPrice: newAvgPrice?.toFixed(2) })}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose}>
              {t('addPurchaseCancel')}
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit || addOrUpdateHolding.isPending || saved}
              className={saved ? 'bg-emerald-600 hover:bg-emerald-600 text-white' : ''}
            >
              {saved
                ? <><Check className="h-4 w-4 mr-1.5" />{t('addPurchaseAdded')}</>
                : addOrUpdateHolding.isPending ? t('addPurchaseAdding') : t('addPurchaseSubmit')}
            </Button>
          </div>

          {addOrUpdateHolding.isError && (
            <div className="text-sm text-red-600 dark:text-red-400">
              {addOrUpdateHolding.error instanceof Error ? addOrUpdateHolding.error.message : t('addPurchaseError')}
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
