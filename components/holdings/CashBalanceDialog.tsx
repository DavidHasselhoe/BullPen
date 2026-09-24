'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { useUserSettings } from '@/hooks/use-user-settings';
import type { CurrencyCode } from '@/lib/currency/currency-conversion';

interface CashBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Currency a new balance is entered in. An existing balance keeps its own. */
  displayCurrency: CurrencyCode;
}

export function CashBalanceDialog({ open, onOpenChange, displayCurrency }: CashBalanceDialogProps) {
  const { t } = useTranslation('holdings');
  const { cashBalance } = useUserSettings();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{cashBalance ? t('cashDialogEditTitle') : t('cashDialogAddTitle')}</DialogTitle>
          <DialogDescription>{t('cashDialogDescription')}</DialogDescription>
        </DialogHeader>
        {/* DialogContent unmounts when closed, so the form re-seeds from the saved value on every open. */}
        <CashForm displayCurrency={displayCurrency} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function CashForm({ displayCurrency, onDone }: { displayCurrency: CurrencyCode; onDone: () => void }) {
  const { t } = useTranslation('holdings');
  const { cashBalance, updateCashBalance } = useUserSettings();
  const currency = cashBalance?.currency ?? displayCurrency;
  const [amount, setAmount] = useState(cashBalance ? String(cashBalance.amount) : '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(false);

  const parsed = parseFloat(amount.replace(',', '.'));
  const isValid = amount.trim() === '' || (Number.isFinite(parsed) && parsed >= 0);

  const save = async (value: number | null) => {
    setIsSaving(true);
    setError(false);
    try {
      await updateCashBalance(value && value > 0 ? { amount: value, currency } : null);
      onDone();
    } catch {
      setError(true);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (isValid) void save(amount.trim() === '' ? null : parsed);
      }}
      className="space-y-6"
    >
      <div className="space-y-2">
        <Label htmlFor="cash-amount">{t('cashDialogAmountLabel', { currency })}</Label>
        <Input
          id="cash-amount"
          type="text"
          inputMode="decimal"
          autoFocus
          placeholder="0"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          aria-invalid={!isValid}
        />
      </div>

      <div className="flex items-center justify-between gap-3">
        {cashBalance ? (
          <Button type="button" variant="ghost" onClick={() => void save(null)} disabled={isSaving} className="text-muted-foreground hover:text-red-500">
            {t('cashDialogRemove')}
          </Button>
        ) : <span />}
        <div className="flex gap-3">
          <Button type="button" variant="outline" onClick={onDone}>
            {t('editHoldingCancel')}
          </Button>
          <Button type="submit" disabled={isSaving || !isValid}>
            {isSaving ? t('cashDialogSaving') : t('cashDialogSave')}
          </Button>
        </div>
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">{t('cashDialogError')}</p>
      )}
    </form>
  );
}
