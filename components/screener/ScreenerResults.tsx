'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useRouter } from 'next/navigation';
import { useEntitlements } from '@/hooks/use-entitlements';
import { useAuth } from '@/hooks/use-auth';
import { useAddToWatchlist, useWatchlistLists, useCreateWatchlistList } from '@/hooks/use-watchlist';
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
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowUpDown, ArrowUp, ArrowDown, ChevronLeft, ChevronRight, Bell, Download, Scale, ListPlus, X, Loader2 } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { EmptyState } from '@/components/ui/EmptyState';
import type { ScreenerRow } from '@/app/api/screener/route';
import type { HeatmapPriceEntry } from '@/hooks/use-heatmap-stream';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { getGlossaryEntry } from '@/lib/finance/glossary';
import { SCREENER_COLUMNS, getScreenerColumns, type ScreenerColumn } from './screener-columns';
import { AlertDialog } from '@/components/alerts/AlertDialog';

type SortDir = 'asc' | 'desc';
const PAGE_SIZE_OPTIONS = [25, 50, 100];
const COMPARE_MIN = 2;
const COMPARE_MAX = 5;

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
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function ScreenerResults({
  data,
  livePrices,
  visibleColumns,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: ScreenerResultsProps) {
  const { t } = useTranslation('tools');
  const router = useRouter();
  const { isPro } = useEntitlements();
  const { isAuthenticated } = useAuth();
  const addToWatchlist = useAddToWatchlist();
  const { data: watchlistLists } = useWatchlistLists();
  const createWatchlistList = useCreateWatchlistList();
  const fallbackColumns = useMemo(() => getScreenerColumns(t), [t]);
  const columns = visibleColumns ?? fallbackColumns;
  const [sortKey, setSortKey] = useState<string>('market_cap');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isBulkAdding, setIsBulkAdding] = useState(false);

  // Selection is a UI-only convenience over the current result set — reset it
  // whenever the underlying rows change (new filters/view), rather than let it
  // silently keep referencing tickers that scrolled out of the current screen.
  useEffect(() => {
    setSelected(new Set());
  }, [data]);

  const toggleSelected = useCallback((ticker: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  }, []);

  const sorted = useMemo(() => {
    const col = SCREENER_COLUMNS.find((c) => c.key === sortKey);
    return [...data].sort((a, b) => {
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
  }, [data, sortKey, sortDir, livePrices]);

  const totalPages = Math.ceil(sorted.length / pageSize);
  const paginated = useMemo(
    () => sorted.slice((page - 1) * pageSize, page * pageSize),
    [sorted, page, pageSize]
  );

  const allOnPageSelected = paginated.length > 0 && paginated.every((r) => selected.has(r.ticker));
  const toggleSelectAllOnPage = useCallback(() => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = paginated.every((r) => next.has(r.ticker));
      for (const r of paginated) {
        if (allSelected) next.delete(r.ticker);
        else next.add(r.ticker);
      }
      return next;
    });
  }, [paginated]);

  const selectedTickers = useMemo(() => [...selected], [selected]);
  const canCompare = selectedTickers.length >= COMPARE_MIN && selectedTickers.length <= COMPARE_MAX;

  const compareSelected = useCallback(() => {
    if (!canCompare) return;
    router.push(`/tools/compare?tickers=${selectedTickers.join(',')}`);
  }, [canCompare, selectedTickers, router]);

  const addSelectedToWatchlist = useCallback(async () => {
    if (!isAuthenticated) { router.push('/login'); return; }
    setIsBulkAdding(true);
    try {
      // user_watchlist.list_id is NOT NULL (migration 047) — every add needs a
      // real list. Mirror app/watchlist/page.tsx's handleAdd: use the user's
      // first existing list, or auto-create "Watchlist 1" if they have none.
      let listId = watchlistLists?.[0]?.id;
      if (!listId) {
        const res = await createWatchlistList.mutateAsync({ name: 'Watchlist 1', color: null });
        if (!res.success || !res.list) return;
        listId = res.list.id;
      }
      // Best-effort: add every selection; one failure shouldn't abort the rest
      // (same pattern as WatchlistTemplatesDialog's bulk add).
      await Promise.allSettled(
        selectedTickers.map((ticker) => {
          const row = data.find((r) => r.ticker === ticker);
          return addToWatchlist.mutateAsync({ symbol: ticker, company_name: row?.name ?? ticker, listId });
        })
      );
      setSelected(new Set());
    } finally {
      setIsBulkAdding(false);
    }
  }, [isAuthenticated, selectedTickers, data, addToWatchlist, watchlistLists, createWatchlistList, router]);

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
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/30 px-3 py-2">
          <span className="text-xs font-medium text-foreground">
            {t('screenerSelectedCount', { count: selected.size })}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={!canCompare}
              onClick={compareSelected}
              title={canCompare ? undefined : t('screenerCompareBoundsHint', { min: COMPARE_MIN, max: COMPARE_MAX })}
            >
              <Scale className="h-3.5 w-3.5" />
              {t('screenerCompareSelected')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              disabled={isBulkAdding}
              onClick={addSelectedToWatchlist}
            >
              {isBulkAdding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ListPlus className="h-3.5 w-3.5" />}
              {t('screenerAddSelectedToWatchlist')}
            </Button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={t('screenerClearSelection')}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

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
                <div className="flex min-w-0 items-center gap-2.5">
                  <Checkbox
                    checked={selected.has(row.ticker)}
                    onCheckedChange={() => toggleSelected(row.ticker)}
                    aria-label={t('screenerSelectRow', { ticker: row.ticker })}
                    className="shrink-0"
                  />
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
                </div>
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
                      <span
                        className="truncate text-[11px] text-muted-foreground"
                        title={getGlossaryEntry(col.label)?.description ?? col.tip}
                      >
                        {col.label}
                      </span>
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
          <TableHeader className="sticky top-0 z-20 bg-background shadow-sm">
            <TableRow>
              <TableHead className="sticky left-0 z-30 bg-background" style={{ width: 36, minWidth: 36 }}>
                <Checkbox
                  checked={allOnPageSelected}
                  onCheckedChange={toggleSelectAllOnPage}
                  aria-label={t('screenerSelectAllOnPage')}
                />
              </TableHead>
              <TableHead
                className="sticky left-9 z-30 bg-background"
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
                  // Sortable header, so a Radix TermTooltip can't nest inside the
                  // sort button — mirrors WatchlistTable.tsx's native-title pattern,
                  // sourced from the shared glossary so screener/watchlist/stock-page
                  // copy for the same metric never drifts. col.tip is the fallback for
                  // the few columns (Price, % Chg) with no glossary entry.
                  title={getGlossaryEntry(col.label)?.description ?? col.tip}
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
                <TableRow key={row.ticker} className={cn('hover:bg-muted/40', selected.has(row.ticker) && 'bg-muted/30')}>
                  <TableCell className="sticky left-0 z-10 bg-background">
                    <Checkbox
                      checked={selected.has(row.ticker)}
                      onCheckedChange={() => toggleSelected(row.ticker)}
                      aria-label={t('screenerSelectRow', { ticker: row.ticker })}
                    />
                  </TableCell>
                  <TableCell className="sticky left-9 z-10 bg-background">
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
