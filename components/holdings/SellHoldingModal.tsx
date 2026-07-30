'use client';

import { useEffect, useState } from 'react';
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
import { useSellHolding } from '@/hooks/use-holdings';
import type { UserHolding } from '@/lib/types/database';
import { logger } from '@/lib/utils/logger';

interface SellHoldingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  holding: UserHolding | null;
  /** Live market price in USD, if available — prefills the sale price field.
   *  Must stay in USD (never display-currency-converted): avg_price on the
   *  holding is always USD, and realized P/L here and server-side both
   *  subtract this from avg_price directly. */
  currentPriceUSD?: number;
}

const QUICK_PERCENTS = [25, 50, 75, 100] as const;

export function SellHoldingModal({ open, onOpenChange, holding, currentPriceUSD }: SellHoldingModalProps) {
  const [quantity, setQuantity] = useState('');
  const [salePrice, setSalePrice] = useState('');
  const [saleDate, setSaleDate] = useState(new Date().toISOString().slice(0, 10));
  const [saved, setSaved] = useState(false);
  const sellHolding = useSellHolding();

  useEffect(() => {
    // Deliberately excludes currentPriceUSD from the deps: this page has a live
    // price feed, so currentPriceUSD ticks every few seconds while the modal is
    // open. Populate once per open+holding only — including currentPriceUSD
    // here previously wiped the user's typed quantity/price/date back to
    // defaults on every live tick, silently discarding in-progress input.
    if (holding && open) {
      setQuantity('');
      setSalePrice(currentPriceUSD != null ? String(currentPriceUSD) : (holding.avg_price?.toString() ?? ''));
      setSaleDate(new Date().toISOString().slice(0, 10));
      setSaved(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- currentPriceUSD intentionally excluded, see comment above
  }, [holding, open]);

  if (!holding) return null;

  const heldQty = holding.quantity ?? 0;
  const qtyNum = parseFloat(quantity) || 0;
  const priceNum = parseFloat(salePrice) || 0;
  const realizedPl = holding.avg_price != null ? (priceNum - holding.avg_price) * qtyNum : 0;
  const canSubmit = qtyNum > 0 && qtyNum <= heldQty + 1e-9 && priceNum > 0 && !!saleDate;

  const handlePercent = (pct: number) => {
    const shares = (heldQty * pct) / 100;
    // Round to 6 decimals to avoid float noise like 33.33333333333333.
    setQuantity((Math.round(shares * 1e6) / 1e6).toString());
  };

  const handleClose = () => {
    setQuantity('');
    setSaved(false);
    onOpenChange(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    try {
      await sellHolding.mutateAsync({
        holdingId: holding.id,
        input: { quantitySold: qtyNum, salePrice: priceNum, saleDate },
      });
      setSaved(true);
      setTimeout(handleClose, 1000);
    } catch (error) {
      logger.error('Error selling holding', error);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Sell {holding.symbol}</DialogTitle>
          <DialogDescription>
            You hold {heldQty} shares of {holding.company_name} at an average cost of{' '}
            {holding.avg_price != null ? `$${holding.avg_price.toFixed(2)}` : '—'}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="sell-quantity">Shares to sell</Label>
            <Input
              id="sell-quantity"
              type="number"
              step="0.000001"
              min="0"
              max={heldQty}
              placeholder={`up to ${heldQty}`}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
            <div className="flex gap-2">
              {QUICK_PERCENTS.map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => handlePercent(pct)}
                  className="rounded-full border border-border/60 px-3 py-1 text-xs font-medium text-muted-foreground hover:border-border hover:text-foreground transition-colors"
                >
                  {pct === 100 ? 'All' : `${pct}%`}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="sell-price">Sale price per share (USD)</Label>
            <Input
              id="sell-price"
              type="number"
              step="0.01"
              min="0"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="sell-date">Sale date</Label>
            <Input
              id="sell-date"
              type="date"
              max={new Date().toISOString().slice(0, 10)}
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
            />
          </div>

          {qtyNum > 0 && priceNum > 0 && holding.avg_price != null && (
            <p className={`text-sm font-medium ${realizedPl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {realizedPl >= 0 ? '+' : ''}
              ${realizedPl.toFixed(2)} realized {realizedPl >= 0 ? 'gain' : 'loss'}
            </p>
          )}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit || sellHolding.isPending || saved}
              className={saved ? 'bg-emerald-600 hover:bg-emerald-600 text-white' : ''}
            >
              {saved
                ? <><Check className="h-4 w-4 mr-1.5" />Sold!</>
                : sellHolding.isPending ? 'Selling...' : 'Confirm Sale'}
            </Button>
          </div>

          {sellHolding.isError && (
            <div className="text-sm text-red-600 dark:text-red-400">
              {sellHolding.error instanceof Error ? sellHolding.error.message : 'Failed to sell holding'}
            </div>
          )}
        </form>
      </DialogContent>
    </Dialog>
  );
}
