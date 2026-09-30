'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercent, type CurrencyCode } from '@/lib/currency/currency-conversion';
import { useUserSettings } from '@/hooks/use-user-settings';
import { Skeleton } from '@/components/ui/skeleton';
import { TermTooltip } from '@/components/ui/TermTooltip';
import { ShareSheet } from './ShareSheet';
import type { HoldingWithPrice } from './types';
import { totalReturn, type TotalReturn } from '@/lib/holdings/total-return';

interface PortfolioDashboardProps {
  holdings: HoldingWithPrice[];
  currency?: CurrencyCode;
  isLoading?: boolean;
  /** Manually entered cash, display currency. Added to Total Value only, never to P/L or cost basis. */
  cashValue?: number;
  /** Unrealized + realized, over everything invested (lib/holdings/total-return.ts).
   *  Omitted by the Academy demo, which has no sales: computed from holdings then. */
  total?: TotalReturn;
}

export function PortfolioDashboard({ holdings, currency = 'USD', isLoading, cashValue = 0, total: totalProp }: PortfolioDashboardProps) {
  const { t } = useTranslation('holdings');
  const { roundNumbers } = useUserSettings();
  const fmt = (value: number) =>
    formatCurrency(value, currency, roundNumbers ? { round: true } : undefined);
  const total = useMemo(() => totalProp ?? totalReturn(holdings, [], 1), [totalProp, holdings]);
  const stats = useMemo(() => {
    let totalValue = 0;
    let todayDollar = 0;
    let valuedPositions = 0;

    for (const h of holdings) {
      if (h.marketValue !== undefined && h.marketValue > 0) {
        totalValue += h.marketValue;
        valuedPositions++;
      }
      if (
        h.dayChange !== undefined &&
        h.quantity !== null &&
        h.quantity !== undefined &&
        h.quantity > 0
      ) {
        todayDollar += h.dayChange * h.quantity;
      }
    }

    const yesterdayValue = totalValue - todayDollar;
    const todayPct = yesterdayValue > 0 ? (todayDollar / yesterdayValue) * 100 : 0;
    return { totalValue, todayDollar, todayPct, valuedPositions };
  }, [holdings]);

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border/50 bg-card p-5">
            <Skeleton className="h-3 w-20 mb-3" />
            <Skeleton className="h-7 w-28 mb-2" />
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
    );
  }

  if (stats.valuedPositions === 0) return null;

  const todayPositive = stats.todayDollar >= 0;
  const plPositive = total.total >= 0;

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {/* Total Portfolio Value */}
      <div className="rounded-xl border border-border/50 bg-card p-5">
        <div className="mb-2">
          <TermTooltip
            term="Total Value"
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
          />
        </div>
        <p className="text-2xl font-bold text-foreground tabular-nums">
          {fmt(stats.totalValue + cashValue)}
        </p>
        <p className="text-xs text-muted-foreground mt-1.5">
          {t('portfolioDashboardAcrossPositions', { count: stats.valuedPositions })}
          {cashValue > 0 && ` · ${t('portfolioDashboardPlusCash', { amount: fmt(cashValue) })}`}
        </p>
      </div>

      {/* Today's P&L */}
      <div
        className={cn(
          'rounded-xl border bg-card p-5',
          todayPositive ? 'border-green-500/20' : 'border-red-500/20'
        )}
      >
        <div className="mb-2 flex items-center justify-between">
          <TermTooltip
            term="Today P/L"
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
          />
          <ShareSheet disabled={stats.todayDollar === 0 && stats.todayPct === 0} />
        </div>
        <p
          className={cn(
            'text-2xl font-bold tabular-nums',
            todayPositive
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          )}
        >
          {stats.todayDollar >= 0 ? '+' : ''}
          {fmt(stats.todayDollar)}
        </p>
        <div className="flex items-center gap-1.5 mt-1.5">
          {todayPositive ? (
            <TrendingUp className="h-3 w-3 text-green-500 shrink-0" />
          ) : (
            <TrendingDown className="h-3 w-3 text-red-500 shrink-0" />
          )}
          <span
            className={cn(
              'text-xs font-semibold tabular-nums',
              todayPositive
                ? 'text-green-600 dark:text-green-400'
                : 'text-red-600 dark:text-red-400'
            )}
          >
            {formatPercent(stats.todayPct, roundNumbers)}
          </span>
        </div>
      </div>

      {/* Total P/L */}
      <div
        className={cn(
          'rounded-xl border bg-card p-5',
          plPositive ? 'border-green-500/20' : 'border-red-500/20'
        )}
      >
        <div className="mb-2">
          <TermTooltip
            term="Total P/L"
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
          />
        </div>
        <p
          className={cn(
            'text-2xl font-bold tabular-nums',
            plPositive
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          )}
        >
          {total.total >= 0 ? '+' : ''}
          {fmt(total.total)}
        </p>
        <p
          className={cn(
            'text-xs font-semibold tabular-nums mt-1.5',
            plPositive
              ? 'text-green-600/70 dark:text-green-400/70'
              : 'text-red-600/70 dark:text-red-400/70'
          )}
        >
          {t('portfolioDashboardAllTime', { pct: formatPercent(total.pct, roundNumbers) })}
        </p>
        {total.realized !== 0 && (
          <p className="text-xs text-muted-foreground mt-0.5 tabular-nums">
            {t('portfolioDashboardFromSales', { amount: `${total.realized > 0 ? '+' : '−'}${fmt(Math.abs(total.realized))}` })}
          </p>
        )}
      </div>

      {/* Cost Basis */}
      <div className="rounded-xl border border-border/50 bg-card p-5">
        <div className="mb-2">
          <TermTooltip
            term="Cost Basis"
            className="text-xs font-semibold text-muted-foreground uppercase tracking-wider"
          />
        </div>
        <p className="text-2xl font-bold text-foreground tabular-nums">
          {fmt(total.invested)}
        </p>
        <p className="text-xs text-muted-foreground mt-1.5">
          {t('portfolioDashboardLifetimeInvested')}
        </p>
      </div>
    </div>
  );
}
