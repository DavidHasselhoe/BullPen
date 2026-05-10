'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import type { ScreenerRow } from '@/app/api/screener/route';
import type { LivePriceMap } from '@/hooks/use-live-prices';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';

type SortKey =
  | 'ticker'
  | 'market_cap'
  | 'pe_ratio'
  | 'pb_ratio'
  | 'beta'
  | 'dividend_yield'
  | 'profit_margin'
  | 'revenue_growth_yoy'
  | 'week52_high'
  | 'price'
  | 'change_pct';

type SortDir = 'asc' | 'desc';

function fmtCap(v: number | null): string {
  if (v == null) return '—';
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

function fmtNum(v: number | null, decimals = 2): string {
  if (v == null) return '—';
  return v.toFixed(decimals);
}

function fmtPct(v: number | null, decimals = 1): string {
  if (v == null) return '—';
  return `${v.toFixed(decimals)}%`;
}

function fmtPrice(v: number | null): string {
  if (v == null) return '—';
  return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface ColumnDef {
  key: SortKey;
  label: string;
  tip?: string;
}

const COLUMNS: ColumnDef[] = [
  { key: 'price',            label: 'Price',           tip: 'Live price' },
  { key: 'change_pct',       label: '% Chg',           tip: 'Day change %' },
  { key: 'market_cap',       label: 'Mkt Cap',         tip: 'Market capitalisation' },
  { key: 'pe_ratio',         label: 'P/E',             tip: 'Trailing P/E ratio' },
  { key: 'pb_ratio',         label: 'P/B',             tip: 'Price-to-book ratio' },
  { key: 'beta',             label: 'Beta',            tip: '5Y monthly beta' },
  { key: 'dividend_yield',   label: 'Div Yld',         tip: 'Forward annual dividend yield' },
  { key: 'profit_margin',    label: 'Net Margin',      tip: 'Net profit margin' },
  { key: 'revenue_growth_yoy', label: 'Rev Growth',   tip: 'Quarterly revenue growth YoY' },
  { key: 'week52_high',      label: '52W High',        tip: '52-week high price' },
];

interface ScreenerResultsProps {
  data: ScreenerRow[];
  livePrices?: LivePriceMap;
}

export function ScreenerResults({ data, livePrices }: ScreenerResultsProps) {
  const [sortKey, setSortKey] = useState<SortKey>('market_cap');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      let av: number | null = null;
      let bv: number | null = null;

      if (sortKey === 'ticker') {
        return sortDir === 'asc'
          ? a.ticker.localeCompare(b.ticker)
          : b.ticker.localeCompare(a.ticker);
      }
      if (sortKey === 'price') {
        av = livePrices?.get(a.ticker)?.price ?? null;
        bv = livePrices?.get(b.ticker)?.price ?? null;
      } else if (sortKey === 'change_pct') {
        av = livePrices?.get(a.ticker)?.changePercent ?? null;
        bv = livePrices?.get(b.ticker)?.changePercent ?? null;
      } else {
        av = (a as Record<string, number | null>)[sortKey] ?? null;
        bv = (b as Record<string, number | null>)[sortKey] ?? null;
      }

      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [data, sortKey, sortDir, livePrices]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
    return sortDir === 'asc'
      ? <ArrowUp className="h-3 w-3 text-primary" />
      : <ArrowDown className="h-3 w-3 text-primary" />;
  };

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No companies match the current filters.
      </div>
    );
  }

  return (
    <div className="rounded-md border overflow-auto">
      <Table>
        <TableHeader>
          <TableRow>
            {/* Sticky company column */}
            <TableHead className="sticky left-0 z-10 bg-background min-w-[200px]">
              <button
                onClick={() => toggleSort('ticker')}
                className="flex items-center gap-1 text-xs font-medium hover:text-foreground"
              >
                Company <SortIcon col="ticker" />
              </button>
            </TableHead>

            {COLUMNS.map((col) => (
              <TableHead key={col.key} className="min-w-[80px] text-right" title={col.tip}>
                <button
                  onClick={() => toggleSort(col.key)}
                  className="flex items-center justify-end gap-1 text-xs font-medium w-full hover:text-foreground"
                >
                  {col.label} <SortIcon col={col.key} />
                </button>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>

        <TableBody>
          {sorted.map((row) => {
            const live = livePrices?.get(row.ticker);
            const isUp = (live?.changePercent ?? 0) > 0;
            const isDown = (live?.changePercent ?? 0) < 0;

            return (
              <TableRow key={row.ticker} className="hover:bg-muted/40">
                {/* Company */}
                <TableCell className="sticky left-0 z-10 bg-background">
                  <Link
                    href={slugToAssetPath(row.ticker)}
                    className="flex items-center gap-2.5 group"
                  >
                    <CompanyLogo
                      name={row.name}
                      ticker={row.ticker}
                      logoUrl={row.logo_url}
                      size={28}
                      className="rounded shrink-0"
                    />
                    <div className="min-w-0">
                      <span className="font-semibold text-sm text-foreground group-hover:underline">
                        {row.ticker}
                      </span>
                      <span className="ml-1.5 text-xs text-muted-foreground hidden sm:inline truncate">
                        {row.name.length > 22 ? `${row.name.slice(0, 22)}…` : row.name}
                      </span>
                      {row.sector && (
                        <div>
                          <Badge variant="outline" className="text-[10px] px-1 py-0 mt-0.5">
                            {row.sector}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </Link>
                </TableCell>

                {/* Live price */}
                <TableCell className="text-xs text-right tabular-nums font-medium">
                  {live ? fmtPrice(live.price) : '—'}
                </TableCell>

                {/* Day change % */}
                <TableCell className={cn(
                  'text-xs text-right tabular-nums font-medium',
                  live && isUp && 'text-emerald-500',
                  live && isDown && 'text-red-500',
                )}>
                  {live
                    ? `${isUp ? '+' : ''}${(live.changePercent ?? 0).toFixed(2)}%`
                    : '—'
                  }
                </TableCell>

                {/* Market cap */}
                <TableCell className="text-xs text-right tabular-nums">
                  {fmtCap(row.market_cap)}
                </TableCell>

                {/* P/E */}
                <TableCell className="text-xs text-right tabular-nums">
                  {row.pe_ratio != null && row.pe_ratio > 0 ? fmtNum(row.pe_ratio, 1) : '—'}
                </TableCell>

                {/* P/B */}
                <TableCell className="text-xs text-right tabular-nums">
                  {row.pb_ratio != null && row.pb_ratio > 0 ? fmtNum(row.pb_ratio, 2) : '—'}
                </TableCell>

                {/* Beta */}
                <TableCell className={cn(
                  'text-xs text-right tabular-nums',
                  row.beta != null && row.beta > 1.5 && 'text-orange-500',
                  row.beta != null && row.beta < 0.5 && 'text-blue-500',
                )}>
                  {fmtNum(row.beta, 2)}
                </TableCell>

                {/* Dividend yield */}
                <TableCell className="text-xs text-right tabular-nums">
                  {row.dividend_yield != null && row.dividend_yield > 0
                    ? fmtPct(row.dividend_yield, 2)
                    : '—'}
                </TableCell>

                {/* Net margin */}
                <TableCell className={cn(
                  'text-xs text-right tabular-nums',
                  row.profit_margin != null && row.profit_margin < 0 && 'text-red-500',
                  row.profit_margin != null && row.profit_margin > 0.2 && 'text-emerald-600 dark:text-emerald-400',
                )}>
                  {row.profit_margin != null ? fmtPct(row.profit_margin * 100, 1) : '—'}
                </TableCell>

                {/* Revenue growth */}
                <TableCell className={cn(
                  'text-xs text-right tabular-nums',
                  row.revenue_growth_yoy != null && row.revenue_growth_yoy < 0 && 'text-red-500',
                  row.revenue_growth_yoy != null && row.revenue_growth_yoy > 10 && 'text-emerald-600 dark:text-emerald-400',
                )}>
                  {row.revenue_growth_yoy != null ? fmtPct(row.revenue_growth_yoy, 1) : '—'}
                </TableCell>

                {/* 52W High */}
                <TableCell className="text-xs text-right tabular-nums text-muted-foreground">
                  {fmtPrice(row.week52_high)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
