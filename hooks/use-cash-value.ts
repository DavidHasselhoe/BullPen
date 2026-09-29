'use client';

import { useMemo } from 'react';
import { convertCurrency, type CurrencyCode } from '@/lib/currency/currency-conversion';
import { useExchangeRates } from '@/hooks/use-exchange-rates';
import { useUserSettings } from '@/hooks/use-user-settings';

/**
 * Manually entered cash, in the display currency. Counts toward total value and
 * allocation only: it has no price, day change or P/L. Stays 0 until the rates
 * for a foreign-currency balance arrive, rather than showing NOK under a USD label.
 *
 * `usdRate` is 1 USD in `userCurrency` (1 when USD), `usdRatesLoaded` whether
 * the caller's USD rates have arrived. Shared by Holdings and Home so the two
 * totals can never disagree.
 */
export function useCashValue(userCurrency: CurrencyCode, usdRate: number, usdRatesLoaded: boolean): number {
  const { cashBalance } = useUserSettings();
  const cashNeedsFx = !!cashBalance && cashBalance.currency !== userCurrency;
  // USD balances reuse usdRate; useExchangeRates is disabled for a USD base.
  const cashRates = useExchangeRates(cashNeedsFx && cashBalance.currency !== 'USD' ? cashBalance.currency : null);
  return useMemo(() => {
    if (!cashBalance) return 0;
    if (!cashNeedsFx) return cashBalance.amount;
    if (cashBalance.currency === 'USD') return usdRatesLoaded ? cashBalance.amount * usdRate : 0;
    return cashRates.data ? convertCurrency(cashBalance.amount, cashBalance.currency, userCurrency, cashRates.data) : 0;
  }, [cashBalance, cashNeedsFx, cashRates.data, userCurrency, usdRatesLoaded, usdRate]);
}
