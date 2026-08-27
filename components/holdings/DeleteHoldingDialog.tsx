'use client';

import { Trans, useTranslation } from 'react-i18next';
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
  const { t } = useTranslation('holdings');

  const handleConfirm = () => {
    onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('deleteHoldingDialogTitle')}</DialogTitle>
          <DialogDescription>
            <Trans
              i18nKey="deleteHoldingDialogDescription"
              ns="holdings"
              values={{ symbol, companyName }}
              components={{ strong: <strong /> }}
            />
            {hasShares && ' ' + t('deleteHoldingDialogSharesWarning')}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            {t('deleteHoldingDialogCancel')}
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={isLoading}
          >
            {isLoading ? t('deleteHoldingDialogRemoving') : t('deleteHoldingDialogRemove')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
