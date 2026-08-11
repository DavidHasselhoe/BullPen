'use client';

import { useState } from 'react';
import { Check, History, Loader2, Pencil, Undo2 } from 'lucide-react';
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
import { useHoldingSales, useDeleteHoldingSale, useUpdateHoldingSale } from '@/hooks/use-holdings';
import type { HoldingSale } from '@/lib/types/database';
import { logger } from '@/lib/utils/logger';

function SoldPositionRow({ sale }: { sale: HoldingSale }) {
  const [editing, setEditing] = useState(false);
  const [quantity, setQuantity] = useState(String(sale.quantity_sold));
  const [salePrice, setSalePrice] = useState(String(sale.sale_price));
  const [saleDate, setSaleDate] = useState(sale.sale_date.slice(0, 10));

  const deleteSale = useDeleteHoldingSale();
  const updateSale = useUpdateHoldingSale();

  const startEdit = () => {
    setQuantity(String(sale.quantity_sold));
    setSalePrice(String(sale.sale_price));
    setSaleDate(sale.sale_date.slice(0, 10));
    setEditing(true);
  };

  const qtyNum = parseFloat(quantity) || 0;
  const priceNum = parseFloat(salePrice) || 0;
  const canSave = qtyNum > 0 && priceNum > 0 && !!saleDate;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      await updateSale.mutateAsync({
        saleId: sale.id,
        input: { quantitySold: qtyNum, salePrice: priceNum, saleDate },
      });
      setEditing(false);
    } catch (error) {
      logger.error('Error updating sale', error);
    }
  };

  const handleUndo = async () => {
    try {
      await deleteSale.mutateAsync(sale.id);
    } catch (error) {
      logger.error('Error undoing sale', error);
    }
  };

  if (editing) {
    return (
      <div className="space-y-3 rounded-xl border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{sale.symbol}</span>
          <span className="truncate text-xs text-muted-foreground">{sale.company_name}</span>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <div className="space-y-1">
            <Label htmlFor={`qty-${sale.id}`} className="text-xs text-muted-foreground">Shares</Label>
            <Input
              id={`qty-${sale.id}`}
              type="number"
              step="0.000001"
              min="0"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`price-${sale.id}`} className="text-xs text-muted-foreground">Price</Label>
            <Input
              id={`price-${sale.id}`}
              type="number"
              step="0.01"
              min="0"
              value={salePrice}
              onChange={(e) => setSalePrice(e.target.value)}
              className="h-8"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`date-${sale.id}`} className="text-xs text-muted-foreground">Date</Label>
            <DatePicker
              id={`date-${sale.id}`}
              max={new Date().toISOString().slice(0, 10)}
              value={saleDate}
              onChange={setSaleDate}
              size="sm"
            />
          </div>
        </div>
        {updateSale.isError && (
          <p className="text-xs text-red-500">
            {updateSale.error instanceof Error ? updateSale.error.message : 'Failed to update sale'}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)} disabled={updateSale.isPending}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={handleSave} disabled={!canSave || updateSale.isPending}>
            {updateSale.isPending
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Check className="h-3.5 w-3.5" />}
            Save
          </Button>
        </div>
      </div>
    );
  }

  const isPos = sale.realized_pl >= 0;

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{sale.symbol}</span>
          <span className="truncate text-xs text-muted-foreground">{sale.company_name}</span>
        </div>
        <div className="text-xs text-muted-foreground">
          Sold {sale.quantity_sold} shares at ${sale.sale_price.toFixed(2)} on{' '}
          {new Date(sale.sale_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        <span className={`text-sm font-semibold tabular-nums ${isPos ? 'text-emerald-500' : 'text-red-500'}`}>
          {isPos ? '+' : ''}${sale.realized_pl.toFixed(2)}
        </span>
        <Button variant="ghost" size="sm" onClick={startEdit} title="Edit this sale">
          <Pencil className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={handleUndo} disabled={deleteSale.isPending} title="Undo this sale">
          {deleteSale.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

export function SoldPositionsModal() {
  const { data: sales, isLoading } = useHoldingSales();
  const [open, setOpen] = useState(false);

  if (isLoading || !sales || sales.length === 0) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 h-8 rounded-lg border border-border/60 bg-muted/30 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/60 transition-colors"
      >
        <History className="h-3.5 w-3.5" />
        History
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[560px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Sold Positions</DialogTitle>
            <DialogDescription>Your closed and partially-sold positions.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {sales.map((sale) => (
              <SoldPositionRow key={sale.id} sale={sale} />
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
