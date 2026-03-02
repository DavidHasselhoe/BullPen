'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { ScreenerRow } from '@/app/api/screener/route';

type SortKey = keyof ScreenerRow;
type SortDir = 'asc' | 'desc';

interface ColumnDef {
  key: SortKey;
  label: string;
  format: (v: number | null) => string;
  align?: 'left' | 'right';
}

function fmtCurrency(v: number | null): string {
  if (v == null) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  return `${sign}$${abs.toFixed(0)}`;
}

function fmtPct(v: number | null): string {
  if (v == null) return '—';
  return `${v.toFixed(1)}%`;
}

function fmtNum(v: number | null): string {
  if (v == null) return '—';
  return v.toFixed(2);
}

function fmtRatio(v: number | null): string {
  if (v == null) return '—';
  return v.toFixed(2);
}

const COLUMNS: ColumnDef[] = [
  { key: 'revenue', label: 'Revenue', format: fmtCurrency, align: 'right' },
  { key: 'grossMargin', label: 'Gross M.', format: fmtPct, align: 'right' },
  { key: 'operatingMargin', label: 'Op. M.', format: fmtPct, align: 'right' },
  { key: 'netMargin', label: 'Net M.', format: fmtPct, align: 'right' },
  { key: 'epsDiluted', label: 'EPS', format: fmtNum, align: 'right' },
  { key: 'freeCashFlow', label: 'FCF', format: fmtCurrency, align: 'right' },
  { key: 'revenueGrowth', label: 'Rev Growth', format: fmtPct, align: 'right' },
  { key: 'debtToEquity', label: 'D/E', format: fmtRatio, align: 'right' },
];

interface ScreenerResultsProps {
  data: ScreenerRow[];
}

export function ScreenerResults({ data }: ScreenerResultsProps) {
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sorted = useMemo(() => {
    return [...data].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === 'string' && typeof bv === 'string') {
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      const na = av as number;
      const nb = bv as number;
      return sortDir === 'asc' ? na - nb : nb - na;
    });
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const SortIcon = ({ col }: { col: SortKey }) => {
    if (sortKey !== col) return <ArrowUpDown className="h-3 w-3 opacity-40" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3" />
    ) : (
      <ArrowDown className="h-3 w-3" />
    );
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
            <TableHead className="sticky left-0 z-10 bg-background min-w-[180px]">
              <button onClick={() => toggleSort('ticker')} className="flex items-center gap-1 text-xs font-medium">
                Company <SortIcon col="ticker" />
              </button>
            </TableHead>
            <TableHead className="min-w-[120px]">
              <button onClick={() => toggleSort('sector')} className="flex items-center gap-1 text-xs font-medium">
                Sector <SortIcon col="sector" />
              </button>
            </TableHead>
            {COLUMNS.map((col) => (
              <TableHead key={col.key} className="min-w-[90px] text-right">
                <button
                  onClick={() => toggleSort(col.key)}
                  className="flex items-center justify-end gap-1 text-xs font-medium w-full"
                >
                  {col.label} <SortIcon col={col.key} />
                </button>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.id} className="hover:bg-muted/50">
              <TableCell className="sticky left-0 z-10 bg-background">
                <Link
                  href={`/stock/${row.ticker}`}
                  className="flex items-center gap-2 group"
                >
                  {row.logo_url ? (
                    <Image
                      src={row.logo_url}
                      alt={row.ticker}
                      width={20}
                      height={20}
                      className="rounded-sm"
                    />
                  ) : (
                    <div className="h-5 w-5 rounded-sm bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground">
                      {row.ticker.charAt(0)}
                    </div>
                  )}
                  <div>
                    <span className="font-medium text-sm group-hover:underline">{row.ticker}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground hidden sm:inline">
                      {row.name.length > 20 ? `${row.name.slice(0, 20)}…` : row.name}
                    </span>
                  </div>
                </Link>
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {row.sector || '—'}
              </TableCell>
              {COLUMNS.map((col) => {
                const val = row[col.key] as number | null;
                const isNeg = val != null && val < 0;
                return (
                  <TableCell
                    key={col.key}
                    className={`text-xs text-right tabular-nums ${isNeg ? 'text-red-400' : ''}`}
                  >
                    {col.format(val)}
                  </TableCell>
                );
              })}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
