'use client';

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm text-center">
        <DialogHeader>
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Lock className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle>Upgrade to Pro</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Free accounts are limited to {MAX_FREE_WATCHLISTS} watchlist.
          Upgrade to Pro for unlimited lists, price alerts, and more.
        </p>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button asChild className="w-full">
            <a href="/upgrade">View Pro plans</a>
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => onOpenChange(false)}>
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
