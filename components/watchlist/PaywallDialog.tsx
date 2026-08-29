'use client';

import { useTranslation } from 'react-i18next';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Lock } from 'lucide-react';
import { MAX_FREE_WATCHLISTS } from '@/lib/watchlist/limits';

interface PaywallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PaywallDialog({ open, onOpenChange }: PaywallDialogProps) {
  const { t } = useTranslation('watchlist');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm text-center">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle>{t('watchlistPaywallTitle')}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          {t('watchlistPaywallBody', { max: MAX_FREE_WATCHLISTS })}
        </p>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button asChild className="w-full">
            <a href="/upgrade">{t('watchlistPaywallViewPlans')}</a>
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            {t('watchlistMaybeLater')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
