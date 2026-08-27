'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useUpdateHolding } from '@/hooks/use-holdings';
import type { UserHolding } from '@/lib/types/database';
import type { UpdateHoldingInput } from '@/app/actions/holdings';
import { logger } from '@/lib/utils/logger';

interface EditHoldingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holding: UserHolding | null;
}

export function EditHoldingModal({ open, onOpenChange, holding }: EditHoldingModalProps) {
  const { t } = useTranslation('holdings');
  const [quantity, setQuantity] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [datePurchased, setDatePurchased] = useState('');
  const [saved, setSaved] = useState(false);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const updateHolding = useUpdateHolding();

  // Populate form when holding changes
  useEffect(() => {
    if (holding) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: populate controlled form fields when the holding prop changes
      setQuantity(holding.quantity?.toString() || '');
      setAvgPrice(holding.avg_price?.toString() || '');
      setDatePurchased(holding.date_purchased ?? '');
    }
  }, [holding]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!holding) {
      return;
    }

    try {
      const updates: UpdateHoldingInput = {
        quantity: quantity ? parseFloat(quantity) : null,
        avg_price: avgPrice ? parseFloat(avgPrice) : null,
        date_purchased: datePurchased || null,
      };

      await updateHolding.mutateAsync({
        holdingId: holding.id,
        updates,
      });

      setSaved(true);
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => {
        setSaved(false);
        setQuantity('');
        setAvgPrice('');
        onOpenChange(false);
      }, 1000);
    } catch (error) {
      logger.error('Error updating holding', error);
      // Error is handled by the mutation
    }
  };

  const handleClose = () => {
    if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
    setSaved(false);
    setQuantity('');
    setAvgPrice('');
    setDatePurchased('');
    onOpenChange(false);
  };

  if (!holding) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{t('editHoldingTitle')}</DialogTitle>
          <DialogDescription>
            {t('editHoldingDescription', { symbol: holding.symbol, companyName: holding.company_name })}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Quantity (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="quantity">{t('editHoldingQuantityLabel')}</Label>
            <Input
              id="quantity"
              type="number"
              step="0.01"
              min="0"
              placeholder={t('editHoldingQuantityPlaceholder')}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          {/* Average Price (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="avg-price">{t('editHoldingAvgPriceLabel')}</Label>
            <Input
              id="avg-price"
              type="number"
              step="0.01"
              min="0"
              placeholder={t('editHoldingAvgPricePlaceholder')}
              value={avgPrice}
              onChange={(e) => setAvgPrice(e.target.value)}
            />
          </div>

          {/* Date Purchased (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="date-purchased">{t('editHoldingDateLabel')}</Label>
            <DatePicker
              id="date-purchased"
              max={new Date().toISOString().slice(0, 10)}
              value={datePurchased}
              onChange={setDatePurchased}
              placeholder={t('editHoldingDatePlaceholder')}
            />
            <p className="text-xs text-muted-foreground">
              {t('editHoldingDateHint')}
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose}>
              {t('editHoldingCancel')}
            </Button>
            <Button
              type="submit"
              disabled={updateHolding.isPending || saved}
              className={saved ? 'bg-emerald-600 hover:bg-emerald-600 text-white' : ''}
            >
              {saved
                ? <><Check className="h-4 w-4 mr-1.5" />{t('editHoldingSaved')}</>
                : updateHolding.isPending ? t('editHoldingUpdating') : t('editHoldingSubmit')}
            </Button>
          </div>

          {updateHolding.isError && (
            <div className="text-sm text-red-600 dark:text-red-400">
              {updateHolding.error instanceof Error
                ? updateHolding.error.message
                : t('editHoldingError')}
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
