'use client';

import { useMemo } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCurrency, formatPercent, type CurrencyCode } from '@/lib/currency/currency-conversion';
import { useUserSettings } from '@/hooks/use-user-settings';
import type { HoldingWithPrice } from './types';

interface PortfolioDashboardProps {
  holdings: HoldingWithPrice[];
  currency?: CurrencyCode;
}

export function PortfolioDashboard({ holdings, currency = 'USD' }: PortfolioDashboardProps) {
  const { roundNumbers } = useUserSettings();
  const fmt = (value: number) =>
    formatCurrency(value, currency, roundNumbers ? { round: true } : undefined);
  const stats = useMemo(() => {
    let totalValue = 0;
    let todayDollar = 0;
    let totalPL = 0;
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
      if (h.unrealizedPL !== undefined) {
        totalPL += h.unrealizedPL;
      }
    }

    const yesterdayValue = totalValue - todayDollar;
    const todayPct = yesterdayValue > 0 ? (todayDollar / yesterdayValue) * 100 : 0;
    const costBasis = totalValue - totalPL;
    const totalPLPct = costBasis > 0 ? (totalPL / costBasis) * 100 : 0;

    return { totalValue, todayDollar, todayPct, totalPL, totalPLPct, costBasis, valuedPositions };
  }, [holdings]);

  if (stats.valuedPositions === 0) return null;

  const todayPositive = stats.todayDollar >= 0;
  const plPositive = stats.totalPL >= 0;

  return (
    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
      {/* Total Portfolio Value */}
      <div className="rounded-xl border border-border/50 bg-card p-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Total Value
        </p>
        <p className="text-2xl font-bold text-foreground tabular-nums">
          {fmt(stats.totalValue)}
        </p>
        <p className="text-xs text-muted-foreground mt-1.5">
          across {stats.valuedPositions} position{stats.valuedPositions !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Today's P&L */}
      <div
        className={cn(
          'rounded-xl border bg-card p-5',
          todayPositive ? 'border-green-500/20' : 'border-red-500/20'
        )}
      >
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Today
        </p>
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
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Total P/L
        </p>
        <p
          className={cn(
            'text-2xl font-bold tabular-nums',
            plPositive
              ? 'text-green-600 dark:text-green-400'
              : 'text-red-600 dark:text-red-400'
          )}
        >
          {stats.totalPL >= 0 ? '+' : ''}
          {fmt(stats.totalPL)}
        </p>
        <p
          className={cn(
            'text-xs font-semibold tabular-nums mt-1.5',
            plPositive
              ? 'text-green-600/70 dark:text-green-400/70'
              : 'text-red-600/70 dark:text-red-400/70'
          )}
        >
          {formatPercent(stats.totalPLPct, roundNumbers)} all time
        </p>
      </div>

      {/* Cost Basis */}
      <div className="rounded-xl border border-border/50 bg-card p-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Cost Basis
        </p>
        <p className="text-2xl font-bold text-foreground tabular-nums">
          {fmt(stats.costBasis)}
        </p>
        <p className="text-xs text-muted-foreground mt-1.5">
          lifetime invested
        </p>
      </div>
    </div>
  );
}
