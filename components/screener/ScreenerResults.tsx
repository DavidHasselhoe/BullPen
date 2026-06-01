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
import { Button } from '@/components/ui/button';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Bell } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import type { ScreenerRow } from '@/app/api/screener/route';
import type { HeatmapPriceEntry } from '@/hooks/use-heatmap-stream';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { SCREENER_COLUMNS, computeRvol, type ScreenerColumn } from './screener-columns';
import { AlertDialog } from '@/components/alerts/AlertDialog';

type SortDir = 'asc' | 'desc';
const PAGE_SIZE_OPTIONS = [25, 50, 100];

interface ScreenerResultsProps {
  data: ScreenerRow[];
  livePrices?: Map<string, HeatmapPriceEntry>;
  /** Ordered, visibility-filtered columns from the column chooser. */
  visibleColumns?: ScreenerColumn[];
  /** Client-side minimum relative-volume filter (live-derived, can't be server-side). */
  rvolMin?: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function ScreenerResults({
  data,
  livePrices,
  visibleColumns,
  rvolMin,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: ScreenerResultsProps) {
  const columns = visibleColumns ?? SCREENER_COLUMNS;
  const [sortKey, setSortKey] = useState<string>('market_cap');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  // Client-side RVOL filter — applied before sort/pagination because relative
  // volume depends on the live stream and isn't available to the server.
  const filtered = useMemo(() => {
    if (rvolMin == null || !isFinite(rvolMin) || rvolMin <= 0) return data;
    return data.filter((r) => {
      const rvol = computeRvol(r, livePrices?.get(r.ticker));
      return rvol != null && rvol >= rvolMin;
    });
  }, [data, rvolMin, livePrices]);

  const sorted = useMemo(() => {
    const col = SCREENER_COLUMNS.find((c) => c.key === sortKey);
    return [...filtered].sort((a, b) => {
      if (sortKey === 'ticker') {
        return sortDir === 'asc'
          ? a.ticker.localeCompare(b.ticker)
          : b.ticker.localeCompare(a.ticker);
      }
      const av = col ? col.getValue(a, livePrices?.get(a.ticker)) : null;
      const bv = col ? col.getValue(b, livePrices?.get(b.ticker)) : null;
      if (av == null && bv == null) return 0;
      if (av == null) return 1;   // nulls sort last regardless of direction
      if (bv == null) return -1;
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  }, [filtered, sortKey, sortDir, livePrices]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginated = useMemo(
    () => sorted.slice((page - 1) * pageSize, page * pageSize),
    [sorted, page, pageSize]
  );

  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const sortIcon = (col: string) => {
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

  if (sorted.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center text-sm text-muted-foreground">
        No companies match the current filters.
      </div>
    );
  }

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, sorted.length);

  return (
    <div className="space-y-3">
      <div className="rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="sticky left-0 z-10 bg-background min-w-[160px]">
                <button
                  onClick={() => toggleSort('ticker')}
                  className="flex items-center gap-1 text-xs font-medium hover:text-foreground"
                >
                  Company {sortIcon('ticker')}
                </button>
              </TableHead>

              {columns.map((col) => (
                <TableHead key={col.key} className="min-w-[58px] text-right" title={col.tip}>
                  <button
                    onClick={() => toggleSort(col.key)}
                    className="flex items-center justify-end gap-1 text-xs font-medium w-full hover:text-foreground"
                  >
                    {col.label} {sortIcon(col.key)}
                  </button>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>

          <TableBody>
            {paginated.map((row) => {
              const live = livePrices?.get(row.ticker);
              return (
                <TableRow key={row.ticker} className="hover:bg-muted/40">
                  {/* Company (pinned) */}
                  <TableCell className="sticky left-0 z-10 bg-background">
                    <div className="flex items-center gap-2.5 group/row">
                      <Link
                        href={slugToAssetPath(row.ticker)}
                        className="flex items-center gap-2.5 group min-w-0"
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
                      <div className="opacity-0 group-hover/row:opacity-100 transition-opacity shrink-0">
                        <AlertDialog
                          symbol={row.ticker}
                          companyName={row.name}
                          trigger={
                            <button
                              type="button"
                              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground/50 hover:text-foreground hover:bg-muted/60 transition-colors"
                              title={`Set alert for ${row.ticker}`}
                            >
                              <Bell className="h-3.5 w-3.5" />
                            </button>
                          }
                        />
                      </div>
                    </div>
                  </TableCell>

                  {columns.map((col) => (
                    <TableCell key={col.key} className="text-xs text-right tabular-nums">
                      {col.render(row, live)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Pagination */}
      <div className="flex items-center justify-between px-1">
        <p className="text-xs text-muted-foreground">
          Showing {startItem}–{endItem} of {sorted.length} results
        </p>
        <div className="flex items-center gap-3">
          {/* Page size */}
          <div className="flex items-center gap-1">
            {PAGE_SIZE_OPTIONS.map((sz) => (
              <button
                key={sz}
                onClick={() => onPageSizeChange(sz)}
                className={cn(
                  'px-2 py-0.5 text-xs rounded transition-colors',
                  pageSize === sz
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {sz}
              </button>
            ))}
          </div>
          {/* Prev/Next */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page <= 1}
              onClick={() => onPageChange(page - 1)}
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-xs tabular-nums min-w-[60px] text-center">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7"
              disabled={page >= totalPages}
              onClick={() => onPageChange(page + 1)}
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
