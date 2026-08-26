'use client';

import { useState, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useRouter } from 'next/navigation';
import { useEntitlements } from '@/hooks/use-entitlements';
import { ProBadge } from '@/components/billing/ProBadge';
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
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Bell, Download } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ScreenerRow } from '@/app/api/screener/route';
import type { HeatmapPriceEntry } from '@/hooks/use-heatmap-stream';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { SCREENER_COLUMNS, getScreenerColumns, computeRvol, type ScreenerColumn } from './screener-columns';
import { AlertDialog } from '@/components/alerts/AlertDialog';

type SortDir = 'asc' | 'desc';
const PAGE_SIZE_OPTIONS = [25, 50, 100];

/** Rows older than this (mid/small caps on the slower refresh tier) get a freshness marker. */
const STALE_AFTER_DAYS = 3;

/** Returns a tooltip label when a row's fundamentals are older than the freshness window. */
function stalenessLabel(updatedAt: string | null | undefined, t: TFunction): string | null {
  if (!updatedAt) return null;
  const ms = Date.now() - new Date(updatedAt).getTime();
  if (!isFinite(ms) || ms < 0) return null;
  const days = Math.floor(ms / 86_400_000);
  if (days < STALE_AFTER_DAYS) return null;
  return t('screenerStalenessLabel', { count: days });
}

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
  const { t } = useTranslation('tools');
  const router = useRouter();
  const { isPro } = useEntitlements();
  const fallbackColumns = useMemo(() => getScreenerColumns(t), [t]);
  const columns = visibleColumns ?? fallbackColumns;
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

  const exportCSV = useCallback(() => {
    // CSV export is a Pro feature — free users are routed to /upgrade.
    if (!isPro) { router.push('/upgrade'); return; }
    const headers = [t('screenerCompanyColumnLabel'), t('screenerCsvTicker'), t('screenerCsvSector'), ...columns.map((c) => c.label)];
    const rows = sorted.map((row) => {
      const live = livePrices?.get(row.ticker);
      const cells = [
        `"${row.name.replace(/"/g, '""')}"`,
        row.ticker,
        row.sector ?? '',
        ...columns.map((col) => {
          const v = col.getValue(row, live);
          return v == null ? '' : String(v);
        }),
      ];
      return cells.join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `screener-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sorted, columns, livePrices, isPro, router, t]);

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

  if (data.length === 0 || sorted.length === 0) {
    return (
      <div className="flex items-center justify-center py-10">
        <EmptyState
          pose="search"
          title={t('screenerNoMatchesTitle')}
          description={t('screenerNoMatchesDescription')}
          imageSize={140}
        />
      </div>
    );
  }

  const startItem = (page - 1) * pageSize + 1;
  const endItem = Math.min(page * pageSize, sorted.length);

  return (
    <div className="space-y-3">
      {/* ── Mobile: sort control + card list (the table is unusable < md) ── */}
      <div className="space-y-2 md:hidden">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{t('screenerSortLabel')}</span>
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value)}
            className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-xs"
          >
            <option value="ticker">{t('screenerCsvTicker')}</option>
            {columns.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
            aria-label={sortDir === 'asc' ? t('screenerSortDescendingAriaLabel') : t('screenerSortAscendingAriaLabel')}
            className="flex h-8 w-8 items-center justify-center rounded-md border border-input text-muted-foreground hover:text-foreground"
          >
            {sortDir === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
          </button>
        </div>

        {paginated.map((row) => {
          const live = livePrices?.get(row.ticker);
          const stale = stalenessLabel(row.updated_at, t);
          return (
            <div key={row.ticker} className="rounded-xl border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <Link href={slugToAssetPath(row.ticker)} className="flex min-w-0 items-center gap-2.5">
                  <CompanyLogo name={row.name} ticker={row.ticker} logoUrl={row.logo_url} size={32} className="shrink-0 rounded" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-semibold text-foreground">{row.ticker}</span>
                      {stale && <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400/70" title={stale} />}
                      {row.sector && <Badge variant="outline" className="px-1 py-0 text-[11px]">{row.sector}</Badge>}
                    </div>
                    <span className="block truncate text-xs text-muted-foreground">{row.name}</span>
                  </div>
                </Link>
                <AlertDialog
                  symbol={row.ticker}
                  companyName={row.name}
                  trigger={
                    <button
                      type="button"
                      className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground/80 hover:bg-muted/60 hover:text-foreground"
                      title={t('screenerSetAlertFor', { ticker: row.ticker })}
                    >
                      <Bell className="h-4 w-4" />
                    </button>
                  }
                />
              </div>
              {columns.length > 0 && (
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5">
                  {columns.slice(0, 4).map((col) => (
                    <div key={col.key} className="flex items-center justify-between gap-2">
                      <span className="truncate text-[11px] text-muted-foreground">{col.label}</span>
                      <span className="text-xs font-medium tabular-nums text-foreground">{col.render(row, live)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="hidden md:block rounded-md border overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead
                className="sticky left-0 z-10 bg-background"
                style={{ width: 240, minWidth: 220 }}
              >
                <button
                  onClick={() => toggleSort('ticker')}
                  className="flex items-center gap-1 text-xs font-medium hover:text-foreground"
                >
                  {t('screenerCompanyColumnLabel')} {sortIcon('ticker')}
                </button>
              </TableHead>

              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className="text-right"
                  style={{ width: col.width, minWidth: col.width }}
                  title={col.tip}
                >
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
                          {(() => {
                            const stale = stalenessLabel(row.updated_at, t);
                            return stale ? (
                              <span
                                className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-amber-400/70 align-middle"
                                title={stale}
                              />
                            ) : null;
                          })()}
                          <span className="ml-1.5 text-xs text-muted-foreground hidden sm:inline truncate">
                            {row.name.length > 22 ? `${row.name.slice(0, 22)}…` : row.name}
                          </span>
                          {row.sector && (
                            <div>
                              <Badge variant="outline" className="text-[11px] px-1 py-0 mt-0.5">
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
                              className="h-6 w-6 rounded flex items-center justify-center text-muted-foreground/85 hover:text-foreground hover:bg-muted/60 transition-colors"
                              title={t('screenerSetAlertFor', { ticker: row.ticker })}
                            >
                              <Bell className="h-3.5 w-3.5" />
                            </button>
                          }
                        />
                      </div>
                    </div>
                  </TableCell>

                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      className="text-xs text-right tabular-nums"
                      style={{ width: col.width, minWidth: col.width }}
                    >
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
        <div className="flex items-center gap-3">
          <p className="text-xs text-muted-foreground">
            {t('screenerShowingResults', { start: startItem, end: endItem, total: sorted.length })}
          </p>
          <button
            type="button"
            onClick={exportCSV}
            className="flex items-center gap-1 text-xs text-muted-foreground/80 hover:text-foreground transition-colors"
            title={isPro ? t('screenerExportCsvTitle') : t('screenerExportCsvProOnly')}
          >
            <Download className="h-3 w-3" />
            {t('screenerCsvLabel')}
            {!isPro && <ProBadge className="ml-0.5" />}
          </button>
        </div>
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
