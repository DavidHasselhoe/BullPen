import { useQuery } from '@tanstack/react-query';
import { getExchangeRates, type CurrencyCode } from '@/lib/currency/currency-conversion';

/**
 * Rates with `currency` as the base. Skipped for USD unless `evenForUsd`: most
 * callers only convert USD into the display currency, a no-op for USD, but a
 * portfolio holding a EUR listing still needs EUR→USD.
 */
export function useExchangeRates(currency: CurrencyCode | null = 'USD', evenForUsd = false) {
  return useQuery({
    queryKey: ['exchange-rates', currency],
    queryFn: () => getExchangeRates(currency ?? 'USD'),
    enabled: !!currency && (currency !== 'USD' || evenForUsd),
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}
