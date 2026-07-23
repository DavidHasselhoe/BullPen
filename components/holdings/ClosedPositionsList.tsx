'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Undo2 } from 'lucide-react';
import { useHoldingSales, useDeleteHoldingSale } from '@/hooks/use-holdings';
import { logger } from '@/lib/utils/logger';

export function ClosedPositionsList() {
  const { data: sales, isLoading } = useHoldingSales();
  const deleteSale = useDeleteHoldingSale();
  const [undoingId, setUndoingId] = useState<string | null>(null);

  if (isLoading || !sales || sales.length === 0) return null;

  const handleUndo = async (saleId: string) => {
    setUndoingId(saleId);
    try {
      await deleteSale.mutateAsync(saleId);
    } catch (error) {
      logger.error('Error undoing sale', error);
    } finally {
      setUndoingId(null);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Sold Positions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {sales.map((sale) => {
          const isPos = sale.realized_pl >= 0;
          return (
            <div
              key={sale.id}
              className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3"
            >
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
              <div className="flex shrink-0 items-center gap-3">
                <span className={`text-sm font-semibold tabular-nums ${isPos ? 'text-emerald-500' : 'text-red-500'}`}>
                  {isPos ? '+' : ''}${sale.realized_pl.toFixed(2)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUndo(sale.id)}
                  disabled={undoingId === sale.id}
                  title="Undo this sale"
                >
                  {undoingId === sale.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
