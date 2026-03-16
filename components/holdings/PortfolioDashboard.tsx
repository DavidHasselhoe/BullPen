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
    let up = 0;
    let down = 0;
    let flat = 0;
    let valuedPositions = 0;
    let trackedPositions = 0;

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
      if (h.dayChangePercent !== undefined) {
        trackedPositions++;
        if (h.dayChangePercent > 0.01) up++;
        else if (h.dayChangePercent < -0.01) down++;
        else flat++;
      }
    }

    const yesterdayValue = totalValue - todayDollar;
    const todayPct = yesterdayValue > 0 ? (todayDollar / yesterdayValue) * 100 : 0;

    return { totalValue, todayDollar, todayPct, up, down, flat, valuedPositions, trackedPositions };
  }, [holdings]);

  if (stats.valuedPositions === 0) return null;

  const todayPositive = stats.todayDollar >= 0;
  const total = stats.up + stats.down + stats.flat;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {/* Total Portfolio Value */}
      <div className="rounded-xl border border-border/50 bg-card p-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Portfolio Value
        </p>
        <p className="text-2xl font-bold text-foreground tabular-nums">
          {fmt(stats.totalValue)}
        </p>
        <p className="text-xs text-muted-foreground mt-1.5">
          {stats.valuedPositions} valued position{stats.valuedPositions !== 1 ? 's' : ''}
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
          Today's Performance
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
          <span className="text-xs text-muted-foreground">vs yesterday</span>
        </div>
      </div>

      {/* Positions breakdown */}
      <div className="rounded-xl border border-border/50 bg-card p-5">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Positions Today
        </p>
        <div className="flex items-end gap-4">
          <div>
            <p className="text-2xl font-bold text-green-600 dark:text-green-400 tabular-nums">
              {stats.up}
            </p>
            <p className="text-xs text-muted-foreground">Up</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums">
              {stats.down}
            </p>
            <p className="text-xs text-muted-foreground">Down</p>
          </div>
          {stats.flat > 0 && (
            <div>
              <p className="text-2xl font-bold text-muted-foreground tabular-nums">{stats.flat}</p>
              <p className="text-xs text-muted-foreground">Flat</p>
            </div>
          )}
        </div>
        {total > 0 && (
          <div className="flex h-1.5 rounded-full overflow-hidden mt-3 bg-muted gap-px">
            {stats.up > 0 && (
              <div
                className="bg-green-500 rounded-full transition-all duration-700"
                style={{ width: `${(stats.up / total) * 100}%` }}
              />
            )}
            {stats.flat > 0 && (
              <div
                className="bg-muted-foreground/40 transition-all duration-700"
                style={{ width: `${(stats.flat / total) * 100}%` }}
              />
            )}
            {stats.down > 0 && (
              <div
                className="bg-red-500 rounded-full transition-all duration-700"
                style={{ width: `${(stats.down / total) * 100}%` }}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
