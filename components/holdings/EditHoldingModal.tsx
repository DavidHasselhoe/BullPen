'use client';

import { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
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
  const [quantity, setQuantity] = useState('');
  const [avgPrice, setAvgPrice] = useState('');
  const [datePurchased, setDatePurchased] = useState('');
  const updateHolding = useUpdateHolding();

  // Populate form when holding changes
  useEffect(() => {
    if (holding) {
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

      // Reset form
      setQuantity('');
      setAvgPrice('');
      onOpenChange(false);
    } catch (error) {
      logger.error('Error updating holding', error);
      // Error is handled by the mutation
    }
  };

  const handleClose = () => {
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
          <DialogTitle>Edit Holding</DialogTitle>
          <DialogDescription>
            Update quantity and average price for {holding.symbol} - {holding.company_name}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Quantity (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="quantity">Quantity (Optional)</Label>
            <Input
              id="quantity"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g., 10"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </div>

          {/* Average Price (Optional) */}
          <div className="space-y-2">
            <Label htmlFor="avg-price">Average Price (Optional)</Label>
            <Input
              id="avg-price"
              type="number"
              step="0.01"
              min="0"
              placeholder="e.g., 150.00"
              value={avgPrice}
              onChange={(e) => setAvgPrice(e.target.value)}
            />
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
            <p className="text-xs text-muted-foreground">
              Used to chart your P/L from the day you opened this position.
            </p>
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={updateHolding.isPending}
            >
              {updateHolding.isPending ? 'Updating...' : 'Update Holding'}
            </Button>
          </div>

          {updateHolding.isError && (
            <div className="text-sm text-red-600 dark:text-red-400">
              {updateHolding.error instanceof Error
                ? updateHolding.error.message
                : 'Failed to update holding'}
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
