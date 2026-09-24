'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Checkbox } from '@/components/ui/checkbox';
import { useUserSettings } from '@/hooks/use-user-settings';
import { formatCurrency, getExchangeRates } from '@/lib/currency/currency-conversion';
import { CashIcon } from './CashIcon';

/**
 * State for settling a trade against the tracked cash balance. Lives in the
 * modal (not the checkbox) because the modal's submit is what moves the cash.
 */
export function useCashPayment(open: boolean) {
  const { cashBalance, adjustCashBalance } = useUserSettings();
  const [enabled, setEnabled] = useState(false);
  const base = cashBalance?.currency;

  // Rates based on the cash currency, so any trade currency converts in one step.
  // Not useExchangeRates: that one is disabled for a USD base.
  const { data: rates, isLoading: ratesLoading } = useQuery({
    queryKey: ['exchange-rates-cash', base],
    queryFn: () => getExchangeRates(base!),
    enabled: open && !!base,
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });

  /** `amount` in `currency`, expressed in the cash currency. Null until convertible. */
  const toCash = (amount: number, currency: string): number | null => {
    if (!base) return null;
    if (currency === base) return amount;
    const rate = rates?.rates[currency];
    return rate ? amount / rate : null;
  };

  /**
   * Moves cash for a saved trade: buys subtract, sells add. Call after the
   * holding write succeeds, so a failed trade never touches cash.
   */
  const settle = async (mode: 'buy' | 'sell', amount: number, currency: string) => {
    if (!enabled || !cashBalance || amount <= 0) return;
    const inCash = toCash(amount, currency);
    if (inCash == null) throw new Error('fx_unavailable');
    await adjustCashBalance(mode === 'buy' ? -inCash : inCash);
  };

  return { cashBalance, enabled, setEnabled, toCash, ratesLoading, settle };
}

type CashPayment = ReturnType<typeof useCashPayment>;

interface CashOptionProps {
  payment: CashPayment;
  mode: 'buy' | 'sell';
  /** Trade value (cost or proceeds) in `currency`; 0 while the form is incomplete. */
  amount: number;
  currency: string;
}

/** "Pay from cash" / "Add proceeds to cash". Renders nothing unless the user tracks cash. */
export function CashOption({ payment, mode, amount, currency }: CashOptionProps) {
  const { t } = useTranslation('holdings');
  const { cashBalance, enabled, setEnabled, toCash, ratesLoading } = payment;
  if (!cashBalance) return null;

  const fmt = (v: number) => formatCurrency(v, cashBalance.currency);
  const inCash = amount > 0 ? toCash(amount, currency) : null;
  const cantConvert = amount > 0 && inCash == null && !ratesLoading;
  const after =
    inCash == null ? null : Math.max(0, cashBalance.amount + (mode === 'buy' ? -inCash : inCash));
  const exceeds = mode === 'buy' && inCash != null && inCash > cashBalance.amount;

  return (
    <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
      <label className="flex cursor-pointer items-center gap-3">
        <Checkbox checked={enabled} onCheckedChange={setEnabled} disabled={cantConvert && !enabled} />
        <CashIcon size={24} />
        <span className="flex-1 text-sm font-medium text-foreground">
          {mode === 'buy' ? t('cashOptionPay') : t('cashOptionReceive')}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {t('cashOptionAvailable', { amount: fmt(cashBalance.amount) })}
        </span>
      </label>
      {cantConvert ? (
        <p className="mt-2 text-xs text-muted-foreground">{t('cashOptionNoRate', { currency })}</p>
      ) : enabled && after != null ? (
        <p className="mt-2 text-xs text-muted-foreground" aria-live="polite">
          {exceeds
            ? t('cashOptionExceeds', { amount: fmt(inCash!) })
            : t(mode === 'buy' ? 'cashOptionAfterBuy' : 'cashOptionAfterSell', { amount: fmt(after) })}
        </p>
      ) : null}
    </div>
  );
}
