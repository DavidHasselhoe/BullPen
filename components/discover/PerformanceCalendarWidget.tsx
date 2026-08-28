'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useHoldings } from '@/hooks/use-holdings';
import { useExchangeRates } from '@/hooks/use-exchange-rates';
import { convertCurrency, type CurrencyCode } from '@/lib/currency/currency-conversion';
import { PerformanceCalendar } from '@/components/holdings/performance-calendar/PerformanceCalendar';

/**
 * Homepage widget wrapper for the daily performance calendar.
 *
 * Self-hides for accounts with no holdings — the same courtesy
 * GettingStartedCard extends — so the widget can ship enabled by default
 * without leaving an empty shell on brand-new accounts.
 */
export function PerformanceCalendarWidget() {
  const { t } = useTranslation('discover');
  const { user, isAuthenticated } = useAuth();
  const { data: holdings, isLoading } = useHoldings();

  const userCurrency: CurrencyCode = (() => {
    const settings = (user?.settings as Record<string, unknown>) ?? {};
    const c = settings.default_currency;
    if (!c || c === 'exchange') return 'USD';
    return c as CurrencyCode;
  })();

  const exchangeRates = useExchangeRates(userCurrency);
  const fxRate =
    userCurrency === 'USD' || !exchangeRates.data
      ? 1
      : convertCurrency(1, 'USD', userCurrency, exchangeRates.data);

  const hasHoldings = (holdings ?? []).some((h) => (h.quantity ?? 0) > 0);
  if (!isAuthenticated || isLoading || !hasHoldings) return null;

  return (
    <div className="min-w-0">
      <div className="flex items-center gap-3 mb-4">
        <span className="text-xs font-bold uppercase tracking-[0.15em] text-muted-foreground/85 shrink-0">
          {t('perfCalWidgetTitle')}
        </span>
        <div className="flex-1 h-px bg-border/50" />
        <Link
          href="/holdings"
          className="shrink-0 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {t('perfCalWidgetHoldingsLink')}
          <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <PerformanceCalendar compact currency={userCurrency} fxRate={fxRate} />
    </div>
  );
}
