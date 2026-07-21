import { useQuery } from '@tanstack/react-query';
import { getExchangeRates, type CurrencyCode } from '@/lib/currency/currency-conversion';

export function useExchangeRates(currency: CurrencyCode | null = 'USD') {
  return useQuery({
    queryKey: ['exchange-rates', currency],
    queryFn: () => getExchangeRates(currency ?? 'USD'),
    enabled: !!currency && currency !== 'USD',
    staleTime: 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
  });
}
