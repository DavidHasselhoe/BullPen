'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface DeleteHoldingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  symbol: string;
  companyName: string;
  isLoading?: boolean;
  /** True when the holding still has shares — nudges toward Sell instead of Remove. */
  hasShares?: boolean;
}

export function DeleteHoldingDialog({
  open,
  onOpenChange,
  onConfirm,
  symbol,
  companyName,
  isLoading = false,
  hasShares = false,
}: DeleteHoldingDialogProps) {
  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Remove Holding</DialogTitle>
          <DialogDescription>
            Are you sure you want to remove <strong>{symbol}</strong> ({companyName}) from your holdings? This action cannot be undone.
            {hasShares && ' If you actually sold these shares, use Sell instead to keep your performance chart accurate.'}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Removing...' : 'Remove'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
