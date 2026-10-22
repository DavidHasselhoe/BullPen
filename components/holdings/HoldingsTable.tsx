'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/EmptyState';
import { TermTooltip } from '@/components/ui/TermTooltip';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useHoldings, useRemoveHolding } from '@/hooks/use-holdings';
import { SoldPositionsModal } from '@/components/holdings/SoldPositionsModal';
import { useAuth } from '@/hooks/use-auth';
import { Trash2, Edit2, DollarSign, PlusCircle, ArrowUpRight, ArrowDownRight, Plus, Search, X, Loader2, Upload, Banknote, MoreHorizontal, List } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { logger } from '@/lib/utils/logger';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { cn } from '@/lib/utils';
import { useHoldingsSparklines } from '@/hooks/use-holdings-sparklines';
import { buildCsv, csvNum, csvShares, downloadCsv, exportStem } from '@/lib/export/csv';
import { downloadPdf } from '@/lib/export/pdf';
import { ExportMenu } from '@/components/export/ExportMenu';
import { useEntitlements } from '@/hooks/use-entitlements';

// ─── Sparkline ────────────────────────────────────────────────────────────────

function buildSparkPath(prices: number[], w: number, h: number): string {
  if (prices.length < 2) return '';
  const pad = 1.5;
  const uw = w - pad * 2;
  const uh = h - pad * 2;
  const min = Math.min(...prices);
  const range = Math.max(...prices) - min || 1;
  return prices
    .map((p, i) => {
      const x = (pad + (i / (prices.length - 1)) * uw).toFixed(1);
      const y = (pad + uh - ((p - min) / range) * uh).toFixed(1);
      return `${i === 0 ? 'M' : 'L'}${x},${y}`;
    })
    .join(' ');
}

// SparklineCell is now a pure display component — data comes from the parent's
// single batch query instead of N individual per-row useQuery calls.
/** Last 30 daily closes (app/api/holdings/sparklines). Coloured by that window's own
 *  move, which is why a stock up today can draw red: the column header says "30 days". */
function SparklineCell({ prices, label }: { prices: number[] | null | undefined; label: string }) {
  if (!prices || prices.length < 2) return <div className="w-16 h-7" />;

  // Downsample to at most 60 points for a clean line.
  const step = Math.max(1, Math.floor(prices.length / 60));
  const pts = prices.filter((_, i) => i % step === 0);

  const isUp = pts[pts.length - 1] >= pts[0];
  const color = isUp ? '#22c55e' : '#ef4444';
  const path = buildSparkPath(pts, 64, 28);

  return (
    <svg width={64} height={28} className="overflow-visible" role="img" aria-label={label}>
      <title>{label}</title>
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

import { EditHoldingModal } from './EditHoldingModal';
import { SellHoldingModal } from './SellHoldingModal';
import { AddPurchaseModal } from './AddPurchaseModal';
import { DeleteHoldingDialog } from './DeleteHoldingDialog';
import type { HoldingWithPrice } from './types';
import { getSectorLabel, CASH_SECTOR } from './HoldingsPieChart';
import { CashIcon } from './CashIcon';
import type { UserHolding } from '@/lib/types/database';
import { formatCurrency as formatCurrencyValue, formatNumber as formatNumberUtil, formatPercent as formatPercentUtil, type CurrencyCode } from '@/lib/currency/currency-conversion';
import { useExchangeRates } from '@/hooks/use-exchange-rates';
import { useUserSettings } from '@/hooks/use-user-settings';
import { displayCompanyName } from '@/lib/market-data/company-name';

/** A gain reads '+$1,406.40', not a green '$1,406.40': direction never rides on colour alone. */
const formatSignedCurrency = (value: number, currency: CurrencyCode, opts?: { round: boolean }) =>
  `${value > 0 ? '+' : ''}${formatCurrencyValue(value, currency, opts)}`;

/**
 * A per-share figure in the listing's own trading currency, never converted:
 * the price the user paid and the price the stock quotes at everywhere else.
 * USD reads "$298.40" like every other money cell in the row; anything else
 * keeps its code ("EUR 120.00"), since formatCurrency falls back to "$" for
 * codes it doesn't know. Fixed decimals: formatNumber would print "EUR 120".
 */
function formatListingPrice(value: number, tradingCurrency: string | null, roundNumbers: boolean) {
  const code = tradingCurrency ?? 'USD';
  const digits = roundNumbers ? 0 : 2;
  return code === 'USD'
    ? formatCurrencyValue(value, 'USD', roundNumbers ? { round: true } : undefined)
    : `${code} ${value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

// ─── Export ───────────────────────────────────────────────────────────────────

/**
 * One row model, rendered as CSV or PDF.
 *
 * Avg Cost, Current Price and Cost Basis are in the listing's currency (the
 * Listing Currency column), as in the table; Market Value and P/L are in
 * `currency`, already converted. All are written as plain fixed-decimal
 * numbers with no symbol or thousands separator so a spreadsheet reads them as
 * numbers rather than text.
 */
function buildHoldingsTable(rows: HoldingWithPrice[], currency: string) {
  const headers = [
    'Symbol', 'Company', 'Asset Type', 'Shares', 'Avg Cost', 'Current Price',
    'Cost Basis', 'Market Value', 'Unrealized P/L', 'Unrealized P/L %',
    'Allocation %', 'Date Purchased', 'Currency', 'Listing Currency',
  ];
  const body = rows.map((h) => {
    const costBasis = h.avg_price != null && h.quantity != null ? h.avg_price * h.quantity : null;
    return [
      h.symbol,
      h.company_name ?? '',
      h.asset_type ?? 'stock',
      csvShares(h.quantity),
      csvNum(h.avg_price),
      csvNum(h.currentPriceNative),
      csvNum(costBasis),
      csvNum(h.marketValue),
      csvNum(h.unrealizedPL),
      csvNum(h.unrealizedPLPercent),
      csvNum(h.allocation),
      h.date_purchased ?? '',
      currency,
      h.trading_currency ?? 'USD',
    ];
  });
  // Everything from Shares to Allocation is a figure and belongs right-aligned.
  return { headers, rows: body, numericColumns: [3, 4, 5, 6, 7, 8, 9, 10] };
}


interface HoldingsTableProps {
  onAddClick?: () => void;
  onImportClick?: () => void;
  /** Priced and converted by the page (app/holdings/page.tsx), the one place that does it. */
  holdingsWithPrices: HoldingWithPrice[];
  /** When set, rows not matching this sector label are dimmed. */
  hoveredSector?: string | null;
  /** True while batch quotes are in-flight — shows shimmer in price columns. */
  isPricesLoading: boolean;
  /** Tracked cash in the display currency (0 once spent); null when the user does not track cash. */
  cashValue?: number | null;
  /** Opens the add/edit cash dialog. */
  onCashClick?: () => void;
}

// ─── Per-cell skeleton for price columns ─────────────────────────────────────

function PriceSkeleton({ wide }: { wide?: boolean }) {
  return <Skeleton className={cn('h-4 rounded', wide ? 'w-20' : 'w-14')} />;
}

// ─── Mobile card field (label + value row) ───────────────────────────────────

function HoldingField({ label, value, valueClass, title }: { label: string; value: string; valueClass?: string; title?: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn('font-medium tabular-nums text-foreground', valueClass)} title={title}>{value}</span>
    </div>
  );
}

// ─── Full-table skeleton row (matches column structure) ───────────────────────

function SkeletonTableRow({ index }: { index: number }) {
  return (
    <tr
      className="border-b border-border/50 holdings-row-enter"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <td className="py-4 px-2 xl:px-3">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-lg shrink-0" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      </td>
      <td className="py-4 px-2 xl:px-3"><Skeleton className="h-4 w-8" /></td>
      <td className="py-4 px-2 xl:px-3"><Skeleton className="h-4 w-16" /></td>
      <td className="py-4 px-2 xl:px-3">
        <div className="space-y-1">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-12" />
        </div>
      </td>
      <td className="py-4 px-2 xl:px-3"><Skeleton className="h-4 w-20" /></td>
      <td className="py-4 px-2 xl:px-3">
        <div className="space-y-1">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-10" />
        </div>
      </td>
      <td className="py-4 px-2 xl:px-3">
        <div className="flex items-center gap-2">
          <Skeleton className="h-4 w-8" />
        </div>
      </td>
      <td className="hidden xl:table-cell py-4 px-2 xl:px-3"><Skeleton className="h-7 w-16 rounded" /></td>
      <td className="py-4 px-2 xl:px-3">
        <div className="flex items-center justify-end gap-2">
          <Skeleton className="h-7 w-7 rounded" />
          <Skeleton className="h-7 w-7 rounded" />
        </div>
      </td>
    </tr>
  );
}

// ─── Day change line ────────────────────────────────────────────────────────
// Sits under the current price. It shows percent (compact, sortable-by-eye across rows); hovering
// reveals the actual currency amount so users don't have to do the math from
// market value × percent themselves to see how much a position moved today.

function DayChangeCell({
  dayChangePercent,
  dayChange,
  isPositive,
  colorClass,
  isPriceStale,
  tradingCurrency,
  roundNumbers,
}: {
  dayChangePercent: number;
  /** Per share, in the listing's currency, matching the price above it. */
  dayChange: number | undefined;
  isPositive: boolean;
  colorClass: string;
  isPriceStale: boolean | undefined;
  tradingCurrency: string | null;
  roundNumbers: boolean;
}) {
  const { t } = useTranslation('holdings');
  const trigger = (
    <div className={cn('flex items-center gap-1 animate-in fade-in duration-300', colorClass)}>
      {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      <span className="text-xs font-medium">
        {formatPercentUtil(dayChangePercent, roundNumbers)}
      </span>
    </div>
  );

  if (dayChange === undefined) {
    return (
      <div title={isPriceStale ? t('holdingsTableStaleLastClose') : undefined}>
        {trigger}
      </div>
    );
  }

  const signedAmount = `${dayChange >= 0 ? '+' : ''}${formatListingPrice(dayChange, tradingCurrency, roundNumbers)}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-default">{trigger}</div>
      </TooltipTrigger>
      <TooltipContent>
        {isPriceStale
          ? t('holdingsTableTodayLastClose', { amount: signedAmount })
          : t('holdingsTableToday', { amount: signedAmount })}
      </TooltipContent>
    </Tooltip>
  );
}

// ─── Memoized table row ───────────────────────────────────────────────────────
// Prevents re-rendering unchanged rows on every live-price tick.
// Only volatile price/state fields are in the comparator — static props like
// handlers, formatting options, and rowIndex are intentionally excluded.

interface HoldingRowProps {
  holding: HoldingWithPrice;
  isHighlighted: boolean;
  showPriceSkeleton: boolean;
  rowIndex: number;
  userCurrency: CurrencyCode | null;
  roundNumbers: boolean;
  sparklinePrices: number[] | null | undefined;
  isDeletingThis: boolean;
  anyPending: boolean;
  isEditModalOpen: boolean;
  onEdit: (h: HoldingWithPrice) => void;
  onRemove: (h: { id: string; symbol: string; companyName: string; quantity: number }) => void;
  onSell: (h: HoldingWithPrice) => void;
  onAddPurchase: (h: HoldingWithPrice) => void;
}

const HoldingRow = memo(function HoldingRow({
  holding,
  isHighlighted,
  showPriceSkeleton,
  rowIndex,
  userCurrency,
  roundNumbers,
  sparklinePrices,
  isDeletingThis,
  anyPending,
  isEditModalOpen,
  onEdit,
  onRemove,
  onSell,
  onAddPurchase,
}: HoldingRowProps) {
  const { t } = useTranslation('holdings');
  const queryClient = useQueryClient();
  const isPositive = (holding.dayChangePercent ?? 0) >= 0;
  const plIsPositive = (holding.unrealizedPLPercent ?? 0) >= 0;
  const dayChangeColor = isPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  const plColor = plIsPositive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
  const currency = userCurrency ?? 'USD';

  const prefetchStock = useCallback(() => {
    queryClient.prefetchQuery({
      queryKey: ['stock-snapshot', holding.symbol],
      queryFn: () => fetch(`/api/stock/${holding.symbol}/snapshot`).then(r => r.json()),
      staleTime: 30_000,
    });
  }, [queryClient, holding.symbol]);

  return (
    <tr
      className={cn(
        'border-b border-border/50 hover:bg-muted/30 transition-all duration-200 holdings-row-enter',
        !isHighlighted && 'opacity-25'
      )}
      style={{ animationDelay: `${rowIndex * 45}ms` }}
    >
      <td className="py-4 px-2 xl:px-3">
        <Link
          href={slugToAssetPath(holding.symbol)}
          onMouseEnter={prefetchStock}
          className="flex items-center gap-3 group"
        >
          <CompanyLogo
            name={holding.company_name}
            ticker={holding.symbol}
            logoUrl={holding.logoUrl || null}
            size={48}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              {/* clamp-ok: a company name is a short label; the full legal name is on hover. */}
              <span className="max-w-32 xl:max-w-40 truncate font-medium text-foreground group-hover:underline" title={holding.company_name ?? undefined}>
                {holding.display_name || displayCompanyName(holding.company_name || holding.symbol, holding.symbol)}
              </span>
              {holding.source === 'snaptrade' && (
                <span className="inline-flex items-center rounded-full bg-blue-500/10 px-1.5 py-0 text-[11px] font-medium text-blue-400 border border-blue-500/20">
                  {t('holdingsTableSynced')}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{holding.symbol}</div>
          </div>
        </Link>
      </td>
      <td className="py-4 px-2 xl:px-3 text-sm text-foreground">
        {holding.quantity !== null ? formatNumberUtil(holding.quantity, roundNumbers) : '—'}
      </td>
      <td className="py-4 px-2 xl:px-3 text-sm whitespace-nowrap text-foreground">
        {/* Avg and current price stay in the listing's own currency so the two
            compare at a glance ($379 → $880); Market Value and P/L carry the
            user's currency. */}
        {holding.avg_price !== null && holding.avg_price !== undefined
          ? formatListingPrice(holding.avg_price, holding.trading_currency, roundNumbers)
          : '—'}
      </td>
      {/* Price with today's move under it, the same two-line shape as the P/L
          cell. As its own column the move cost ~120px and pushed the table
          past the card at 1280px: a scrollbar and three-line wrapped headers. */}
      <td className="py-4 px-2 xl:px-3 text-sm font-medium text-foreground">
        {showPriceSkeleton ? (
          <div className="space-y-1"><PriceSkeleton /><PriceSkeleton /></div>
        ) : holding.currentPriceNative !== undefined ? (
          <div className="space-y-0.5">
            <div
              className={cn('animate-in fade-in duration-300', holding.isPriceStale && 'text-muted-foreground')}
              title={holding.isPriceStale ? t('holdingsTableStaleLastClose') : undefined}
            >
              {formatListingPrice(holding.currentPriceNative, holding.trading_currency, roundNumbers)}
            </div>
            {holding.dayChangePercent !== undefined && (
              <DayChangeCell
                dayChangePercent={holding.dayChangePercent}
                dayChange={holding.dayChangeNative}
                isPositive={isPositive}
                colorClass={holding.isPriceStale ? `${dayChangeColor} opacity-60` : dayChangeColor}
                isPriceStale={holding.isPriceStale}
                tradingCurrency={holding.trading_currency}
                roundNumbers={roundNumbers}
              />
            )}
          </div>
        ) : '—'}
      </td>
      <td className="py-4 px-2 xl:px-3 text-sm font-medium text-foreground">
        {showPriceSkeleton ? <PriceSkeleton wide /> : holding.marketValue !== undefined ? (
          <span className="animate-in fade-in duration-300">
            {formatCurrencyValue(holding.marketValue, currency, roundNumbers ? { round: true } : undefined)}
          </span>
        ) : '—'}
      </td>
      <td className="py-4 px-2 xl:px-3">
        {showPriceSkeleton ? (
          <div className="space-y-1"><PriceSkeleton /><PriceSkeleton /></div>
        ) : holding.unrealizedPL !== undefined ? (
          <div className={cn(plColor, 'animate-in fade-in duration-300')}>
            <div className="text-sm font-medium">
              {formatSignedCurrency(holding.unrealizedPL, currency, roundNumbers ? { round: true } : undefined)}
            </div>
            {holding.unrealizedPLPercent !== undefined && (
              <div className="text-xs">{formatPercentUtil(holding.unrealizedPLPercent, roundNumbers)}</div>
            )}
          </div>
        ) : <span className="text-sm text-muted-foreground">—</span>}
      </td>
      <td className="py-4 px-2 xl:px-3">
        {showPriceSkeleton ? (
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-8" />
          </div>
        ) : holding.allocation !== undefined ? (
          <div className="animate-in fade-in duration-300">
            <span className="text-sm tabular-nums text-foreground">
              {holding.allocation.toFixed(roundNumbers ? 0 : 1)}%
            </span>
          </div>
        ) : <span className="text-sm text-muted-foreground">—</span>}
      </td>
      {/* The sparkline is the decorative extra, so it gives way below xl and
          the table still fits a 1024px laptop instead of scrolling sideways. */}
      <td className="hidden xl:table-cell py-4 px-2 xl:px-3">
        <SparklineCell prices={sparklinePrices} label={t('holdingsTableTrend30dLabel', { symbol: holding.symbol })} />
      </td>
      <td className="py-4 px-2 xl:px-3">
        <div className="flex items-center justify-end">
          <HoldingActionsMenu
            holding={holding}
            disabled={anyPending}
            editDisabled={isEditModalOpen}
            busy={isDeletingThis}
            onEdit={() => onEdit(holding)}
            onSell={() => onSell(holding)}
            onAddPurchase={() => onAddPurchase(holding)}
            onRemove={() => onRemove({ id: holding.id, symbol: holding.symbol, companyName: holding.company_name, quantity: holding.quantity ?? 0 })}
          />
        </div>
      </td>
    </tr>
  );
}, (prev, next) =>
  prev.holding.currentPriceNative === next.holding.currentPriceNative &&
  prev.holding.dayChangePercent === next.holding.dayChangePercent &&
  prev.holding.isPriceStale === next.holding.isPriceStale &&
  prev.holding.marketValue === next.holding.marketValue &&
  prev.holding.unrealizedPL === next.holding.unrealizedPL &&
  prev.holding.allocation === next.holding.allocation &&
  prev.holding.trading_currency === next.holding.trading_currency &&
  prev.isHighlighted === next.isHighlighted &&
  prev.showPriceSkeleton === next.showPriceSkeleton &&
  prev.isDeletingThis === next.isDeletingThis &&
  prev.anyPending === next.anyPending &&
  prev.isEditModalOpen === next.isEditModalOpen &&
  prev.sparklinePrices === next.sparklinePrices
);

// ─── Main table ───────────────────────────────────────────────────────────────

export function HoldingsTable({ onAddClick, onImportClick, holdingsWithPrices, hoveredSector, isPricesLoading: isLoadingPrices, cashValue = null, onCashClick }: HoldingsTableProps) {
  const { t } = useTranslation('holdings');
  const { data: holdings, isLoading } = useHoldings();
  const { user } = useAuth();
  const { roundNumbers } = useUserSettings();
  const removeHolding = useRemoveHolding();
  const { isPro } = useEntitlements();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'marketValue' | 'symbol' | 'allocation'>('marketValue');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [editingHolding, setEditingHolding] = useState<UserHolding | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [deletingHolding, setDeletingHolding] = useState<{ id: string; symbol: string; companyName: string; quantity: number } | null>(null);
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
  const [sellingHolding, setSellingHolding] = useState<UserHolding | null>(null);
  const [isSellModalOpen, setIsSellModalOpen] = useState(false);
  const [addingPurchaseHolding, setAddingPurchaseHolding] = useState<UserHolding | null>(null);
  const [isAddPurchaseModalOpen, setIsAddPurchaseModalOpen] = useState(false);

  // Batch sparklines — one request for all symbols instead of N individual candle fetches.
  const allSymbols = useMemo(
    () => holdingsWithPrices.map(h => h.symbol),
    [holdingsWithPrices]
  );
  const sparklines = useHoldingsSparklines(allSymbols);

  // Stable row handlers so HoldingRow memo comparator sees the same references.
  const handleEditRow = useCallback((h: HoldingWithPrice) => {
    setEditingHolding(h as unknown as UserHolding);
    setIsEditModalOpen(true);
  }, []);
  const handleRemoveRow = useCallback((h: { id: string; symbol: string; companyName: string; quantity: number }) => {
    setDeletingHolding(h);
    setIsDeleteDialogOpen(true);
  }, []);
  const handleSellRow = useCallback((h: HoldingWithPrice) => {
    setSellingHolding(h as unknown as UserHolding);
    setIsSellModalOpen(true);
  }, []);
  const handleAddPurchaseRow = useCallback((h: HoldingWithPrice) => {
    setAddingPurchaseHolding(h as unknown as UserHolding);
    setIsAddPurchaseModalOpen(true);
  }, []);

  // Get user's currency preference
  const userCurrency = useMemo((): CurrencyCode | null => {
    if (!user?.settings) return null;
    const settings = user.settings as Record<string, unknown>;
    const currency = settings.default_currency as string | undefined;
    // null or 'exchange' means "Based on exchange" (show USD for US stocks)
    if (!currency || currency === 'exchange') return null;
    return currency as CurrencyCode;
  }, [user]);

  const exchangeRates = useExchangeRates(userCurrency);

  // True while we're converting to a non-USD display currency but don't have rates yet.
  // Guards against showing a raw USD number under a non-USD currency label: the page
  // converts at a rate of 1 until rates arrive, so Market Value and P/L "look loaded"
  // while still mislabeled, and isLoadingPrices alone can't catch that.
  const isFxLoading = userCurrency !== null && exchangeRates.isLoading;

  // Hidden while searching: search filters positions by symbol/name, and cash has neither.
  const showCash = cashValue != null && !search;

  // Same denominator the page uses for the holdings' allocation (positions + cash).
  const cashAllocation = useMemo(() => {
    if (!cashValue) return 0;
    const invested = holdingsWithPrices.reduce((sum, h) => sum + (h.marketValue ?? 0), 0);
    return (cashValue / (invested + cashValue)) * 100;
  }, [holdingsWithPrices, cashValue]);

  // Sort holdings
  const sortedHoldings = useMemo(() => {
    if (!holdingsWithPrices) return [];
    
    const sorted = [...holdingsWithPrices].sort((a, b) => {
      let comparison = 0;
      
      if (sortBy === 'marketValue') {
        const aVal = a.marketValue || 0;
        const bVal = b.marketValue || 0;
        comparison = aVal - bVal;
      } else if (sortBy === 'symbol') {
        comparison = a.symbol.localeCompare(b.symbol);
      } else if (sortBy === 'allocation') {
        const aVal = a.allocation || 0;
        const bVal = b.allocation || 0;
        comparison = aVal - bVal;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });
    
    return sorted;
  }, [holdingsWithPrices, sortBy, sortOrder]);

  // Apply search filter after sorting
  const filteredHoldings = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedHoldings;
    return sortedHoldings.filter(
      (h) =>
        h.symbol.toLowerCase().includes(q) ||
        h.company_name.toLowerCase().includes(q)
    );
  }, [sortedHoldings, search]);

  const handleSort = (column: typeof sortBy) => {
    if (sortBy === column) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(column);
      setSortOrder('desc');
    }
  };

  // Export all holdings (not the search-filtered subset) — Pro-gated like screener export.
  // Both formats share one row model, so the PDF can never disagree with the
  // CSV about what a holding is worth. Exports all holdings, not the
  // search-filtered subset.
  const exportMeta = useMemo(
    () => ({
      Exported: new Date().toISOString().slice(0, 10),
      Positions: String(sortedHoldings.length),
      Currency: userCurrency ?? 'USD',
    }),
    [sortedHoldings.length, userCurrency]
  );

  const handleExportCsv = useCallback(() => {
    if (sortedHoldings.length === 0) return;
    const { headers, rows } = buildHoldingsTable(sortedHoldings, userCurrency ?? 'USD');
    downloadCsv(`${exportStem('holdings')}.csv`, buildCsv({ headers, rows, meta: exportMeta }));
  }, [sortedHoldings, userCurrency, exportMeta]);

  const handleExportPdf = useCallback(async () => {
    if (sortedHoldings.length === 0) return;
    const { headers, rows, numericColumns } = buildHoldingsTable(sortedHoldings, userCurrency ?? 'USD');
    await downloadPdf(`${exportStem('holdings')}.pdf`, {
      title: 'Holdings',
      meta: exportMeta,
      headers,
      rows,
      numericColumns,
      orientation: 'landscape',
      // No row cap here. The default exists to stop a screener export of the
      // whole universe becoming a 118-page document; a portfolio is finite and
      // it is the user's own data, so silently dropping the tail of it is the
      // one place truncation would actually be wrong.
      maxRows: Number.POSITIVE_INFINITY,
    });
  }, [sortedHoldings, userCurrency, exportMeta]);

  const handleConfirmDelete = async () => {
    if (!deletingHolding) return;
    try {
      await removeHolding.mutateAsync(deletingHolding.id);
    } catch (error) {
      logger.error('Error removing holding', error);
    } finally {
      setDeletingHolding(null);
    }
  };

  if (isLoading) {
    return (
      <>
        <style>{`
          @keyframes holdingsRowIn {
            from { opacity: 0; transform: translateY(5px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .holdings-row-enter {
            animation: holdingsRowIn 0.28s ease-out both;
          }
        `}</style>
        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle>{t('holdingsTableTitle')}</CardTitle>
              <Skeleton className="h-8 w-56 rounded-lg" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border/50">
                    <th className="text-left py-3 px-2 xl:px-3 text-sm font-medium text-muted-foreground">{t('holdingsTableColSymbol')}</th>
                    <th className="text-left py-3 px-2 xl:px-3 text-sm font-medium text-muted-foreground">{t('holdingsTableColQuantity')}</th>
                    <th className="text-left py-3 px-2 xl:px-3 text-sm font-medium text-muted-foreground"><TermTooltip term="Avg Price" /></th>
                    <th className="text-left py-3 px-2 xl:px-3 text-sm font-medium text-muted-foreground">{t('holdingsTableColCurrentPrice')}</th>
                    <th className="text-left py-3 px-2 xl:px-3 text-sm font-medium text-muted-foreground">{t('holdingsTableColMarketValue')}</th>
                    <th className="text-left py-3 px-2 xl:px-3 text-sm font-medium text-muted-foreground"><TermTooltip term="Unrealized P/L" /></th>
                    <th className="text-left py-3 px-2 xl:px-3 text-sm font-medium text-muted-foreground">{t('holdingsTableColAllocation')}</th>
                    <th className="hidden xl:table-cell py-3 px-2 xl:px-3 text-left text-sm font-medium text-muted-foreground">{t('holdingsTableColTrend30d')}</th>
                    <th className="text-right py-3 px-2 xl:px-3 text-sm font-medium text-muted-foreground">{t('holdingsTableColActions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[0, 1, 2, 3, 4].map((i) => (
                    <SkeletonTableRow key={i} index={i} />
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </>
    );
  }

  if (!holdings || holdings.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('holdingsTableTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="py-6">
          <EmptyState
            title={t('holdingsTableEmptyTitle')}
            description={t('holdingsTableEmptyDescription')}
          >
            <div className="mx-auto flex max-w-md flex-col gap-2 sm:flex-row">
              {onAddClick && (
                <button
                  onClick={onAddClick}
                  className="flex-1 flex items-center justify-center gap-2 py-5 rounded-lg border-2 border-dashed border-border/60 hover:border-primary/50 hover:bg-primary/5 text-muted-foreground hover:text-primary transition-colors group"
                >
                  <span className="flex items-center justify-center h-8 w-8 rounded-full border-2 border-dashed border-border/60 group-hover:border-primary/50 transition-colors">
                    <Plus className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium">{t('holdingsTableAddFirstHolding')}</span>
                </button>
              )}
              {onImportClick && (
                <button
                  onClick={onImportClick}
                  className="flex-1 flex items-center justify-center gap-2 py-5 rounded-lg border-2 border-dashed border-border/60 hover:border-emerald-500/40 hover:bg-emerald-500/5 text-muted-foreground hover:text-emerald-500 transition-colors group"
                >
                  <span className="flex items-center justify-center h-8 w-8 rounded-full border-2 border-dashed border-border/60 group-hover:border-emerald-500/40 transition-colors">
                    <Upload className="h-4 w-4" />
                  </span>
                  <span className="text-sm font-medium">{t('holdingsTableImportFromCsv')}</span>
                </button>
              )}
            </div>
          </EmptyState>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
    <style>{`
      @keyframes holdingsRowIn {
        from { opacity: 0; transform: translateY(5px); }
        to   { opacity: 1; transform: translateY(0); }
      }
      .holdings-row-enter {
        animation: holdingsRowIn 0.28s ease-out both;
      }
    `}</style>
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <CardTitle role="heading" aria-level={2} className="flex items-center gap-2 text-base font-semibold">
            <List className="h-4 w-4 text-muted-foreground" />
            {t('holdingsTablePositionsTitle')}
          </CardTitle>
          {/* Wraps: in one row the full-width search box ran off phone screens.
              On phones Add and search share the first row and the secondary
              actions drop below; from sm up it reads Add, secondary, search. */}
          <div className="flex flex-wrap items-center gap-2">
            {onAddClick && sortedHoldings.length > 0 && (
              <button
                onClick={onAddClick}
                className="flex items-center gap-1.5 h-8 rounded-lg bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 active:scale-[0.97] transition-[background-color,transform] duration-150"
              >
                <Plus className="h-3.5 w-3.5" />
                {t('holdingsTableAddHolding')}
              </button>
            )}
            <div className="order-last flex basis-full flex-wrap items-center gap-2 sm:order-none sm:basis-auto">
            {onImportClick && (
              <button
                onClick={onImportClick}
                className="flex items-center gap-1.5 h-8 rounded-lg border border-border/60 bg-muted/30 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/60 transition-colors"
              >
                <Upload className="h-3.5 w-3.5" />
                {t('holdingsTableImportCsv')}
              </button>
            )}
            {sortedHoldings.length > 0 && (
              <ExportMenu
                onExportCsv={handleExportCsv}
                onExportPdf={handleExportPdf}
                isPro={isPro}
                label={t('holdingsTableExport')}
                csvLabel="CSV"
                pdfLabel="PDF"
                errorLabel={t('holdingsTableExportFailed')}
                title={isPro ? t('holdingsTableExportTitle') : t('holdingsTableExportProOnlyTitle')}
                className="h-8 gap-1.5 rounded-lg border border-border/60 bg-muted/30 px-3 font-medium text-muted-foreground hover:border-border hover:bg-muted/60"
              />
            )}
            {onCashClick && cashValue == null && (
              <button
                onClick={onCashClick}
                className="flex items-center gap-1.5 h-8 rounded-lg border border-border/60 bg-muted/30 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/60 transition-colors"
              >
                <Banknote className="h-3.5 w-3.5" />
                {t('holdingsTableAddCash')}
              </button>
            )}
            <SoldPositionsModal />
            </div>
          {/* Search */}
          <div className="relative min-w-[9rem] flex-1 sm:w-56 sm:flex-none">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder={t('holdingsTableSearchPlaceholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-7 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          </div>
        </div>
        {search && (
          <p className="text-xs text-muted-foreground mt-1">
            {t('holdingsTableSearchSummary', { filtered: filteredHoldings.length, count: sortedHoldings.length })}
          </p>
        )}
      </CardHeader>
      <CardContent>
        {/* Mobile: card list (the 10-column table is unusable < md) */}
        <div className="space-y-2 lg:hidden">
          {filteredHoldings.length === 0 && search && (
            <p className="py-8 text-center text-sm text-muted-foreground">{t('holdingsTableNoMatch', { search })}</p>
          )}
          {filteredHoldings.map((holding) => {
            const isPos = (holding.dayChangePercent ?? 0) >= 0;
            const plPos = (holding.unrealizedPLPercent ?? 0) >= 0;
            const ccy = userCurrency ?? 'USD';
            const opts = roundNumbers ? { round: true } : undefined;
            return (
              <div key={holding.id} className="rounded-xl border bg-card p-3">
                <div className="flex items-start justify-between gap-2">
                  <Link href={slugToAssetPath(holding.symbol)} className="flex min-w-0 items-center gap-2.5">
                    <CompanyLogo name={holding.company_name} ticker={holding.symbol} logoUrl={holding.logoUrl || null} size={36} />
                    <div className="min-w-0">
                      {/* clamp-ok: a company name is a short label; the full legal name is on hover. */}
                      <span className="block truncate text-sm font-semibold text-foreground" title={holding.company_name ?? undefined}>
                        {holding.display_name || displayCompanyName(holding.company_name || holding.symbol, holding.symbol)}
                      </span>
                      <span className="block text-xs text-muted-foreground">{holding.symbol}</span>
                    </div>
                  </Link>
                  <HoldingActionsMenu
                    holding={holding}
                    disabled={removeHolding.isPending}
                    editDisabled={isEditModalOpen}
                    busy={removeHolding.isPending && deletingHolding?.id === holding.id}
                    triggerClassName="h-10 w-10 shrink-0"
                    onEdit={() => handleEditRow(holding)}
                    onSell={() => handleSellRow(holding)}
                    onAddPurchase={() => handleAddPurchaseRow(holding)}
                    onRemove={() => handleRemoveRow({ id: holding.id, symbol: holding.symbol, companyName: holding.company_name, quantity: holding.quantity ?? 0 })}
                  />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <HoldingField
                    label={t('holdingsTableFieldPrice')}
                    valueClass={holding.isPriceStale ? 'text-muted-foreground' : undefined}
                    title={holding.isPriceStale ? t('holdingsTableStaleLastClose') : undefined}
                    value={holding.currentPriceNative !== undefined ? formatListingPrice(holding.currentPriceNative, holding.trading_currency, roundNumbers) : '—'}
                  />
                  <HoldingField
                    label={t('holdingsTableFieldDay')}
                    valueClass={cn(isPos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400', holding.isPriceStale && 'opacity-60')}
                    title={holding.isPriceStale ? t('holdingsTableStaleLastClose') : undefined}
                    value={holding.dayChangePercent !== undefined ? formatPercentUtil(holding.dayChangePercent, roundNumbers) : '—'}
                  />
                  <HoldingField label={t('holdingsTableFieldValue')} value={holding.marketValue !== undefined ? formatCurrencyValue(holding.marketValue, ccy, opts) : '—'} />
                  <HoldingField
                    label={t('holdingsTableFieldPl')}
                    valueClass={plPos ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}
                    value={
                      holding.unrealizedPL !== undefined
                        ? `${formatSignedCurrency(holding.unrealizedPL, ccy, opts)}${holding.unrealizedPLPercent !== undefined ? ` (${formatPercentUtil(holding.unrealizedPLPercent, roundNumbers)})` : ''}`
                        : '—'
                    }
                  />
                </div>
              </div>
            );
          })}
          {showCash && (
            <div className="rounded-xl border bg-card p-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2.5">
                  <CashIcon size={36} />
                  <span className="text-sm font-semibold text-foreground">{t('holdingsCash')}</span>
                </div>
                <button onClick={onCashClick} title={t('holdingsTableEditCash')} aria-label={t('holdingsTableEditCash')} className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground">
                  <Edit2 className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                <HoldingField label={t('holdingsTableFieldValue')} value={formatCurrencyValue(cashValue ?? 0, userCurrency ?? 'USD', roundNumbers ? { round: true } : undefined)} />
                <HoldingField label={t('holdingsTableColAllocation')} value={`${cashAllocation.toFixed(roundNumbers ? 0 : 1)}%`} />
              </div>
            </div>
          )}
          {onAddClick && (
            <button onClick={onAddClick} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
              <Plus className="h-4 w-4" /> {t('holdingsTableAddHolding')}
            </button>
          )}
        </div>

        <div className="hidden lg:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-3 px-2 xl:px-3 text-sm font-medium text-muted-foreground">
                  <button
                    onClick={() => handleSort('symbol')}
                    className="text-left hover:text-foreground transition-colors"
                  >
                    {t('holdingsTableColSymbol')}
                  </button>
                </th>
                <th className="text-left py-3 px-2 xl:px-3 text-sm font-medium text-muted-foreground">
                  {t('holdingsTableColQuantity')}
                </th>
                <th className="text-left py-3 px-2 xl:px-3 text-sm font-medium text-muted-foreground">
                  <TermTooltip term="Avg Price" />
                </th>
                <th className="text-left py-3 px-2 xl:px-3 text-sm font-medium text-muted-foreground">
                  {t('holdingsTableColCurrentPrice')}
                </th>
                <th className="text-left py-3 px-2 xl:px-3 text-sm font-medium text-muted-foreground">
                  <button
                    onClick={() => handleSort('marketValue')}
                    className="text-left hover:text-foreground transition-colors"
                  >
                    {t('holdingsTableColMarketValue')}
                  </button>
                </th>
                <th className="text-left py-3 px-2 xl:px-3 text-sm font-medium text-muted-foreground">
                  <TermTooltip term="Unrealized P/L" />
                </th>
                <th className="text-left py-3 px-2 xl:px-3 text-sm font-medium text-muted-foreground">
                  <button
                    onClick={() => handleSort('allocation')}
                    className="text-left hover:text-foreground transition-colors"
                  >
                    {t('holdingsTableColAllocation')}
                  </button>
                </th>
                <th className="hidden xl:table-cell py-3 px-2 xl:px-3 text-left text-sm font-medium text-muted-foreground">{t('holdingsTableColTrend30d')}</th>
                <th className="text-right py-3 px-2 xl:px-3 text-sm font-medium text-muted-foreground">
                  {t('holdingsTableColActions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredHoldings.length === 0 && search && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-sm text-muted-foreground">
                    {t('holdingsTableNoMatch', { search })}
                  </td>
                </tr>
              )}
              {filteredHoldings.map((holding, rowIndex) => (
                <HoldingRow
                  key={holding.id}
                  holding={holding}
                  rowIndex={rowIndex}
                  isHighlighted={!hoveredSector || getSectorLabel(holding) === hoveredSector}
                  showPriceSkeleton={(isLoadingPrices && holding.currentPrice === undefined) || isFxLoading}
                  userCurrency={userCurrency}
                  roundNumbers={roundNumbers}
                  sparklinePrices={sparklines[holding.symbol] ?? null}
                  isDeletingThis={removeHolding.isPending && deletingHolding?.id === holding.id}
                  anyPending={removeHolding.isPending}
                  isEditModalOpen={isEditModalOpen}
                  onEdit={handleEditRow}
                  onRemove={handleRemoveRow}
                  onSell={handleSellRow}
                  onAddPurchase={handleAddPurchaseRow}
                />
              ))}
              {showCash && (
                <tr
                  className={cn(
                    'border-b border-border/50 hover:bg-muted/30 transition-all duration-200',
                    hoveredSector && hoveredSector !== CASH_SECTOR && 'opacity-25'
                  )}
                >
                  <td className="py-4 px-2 xl:px-3">
                    <div className="flex items-center gap-3">
                      <CashIcon size={48} />
                      <span className="font-medium text-foreground">{t('holdingsCash')}</span>
                    </div>
                  </td>
                  <td className="py-4 px-2 xl:px-3 text-sm text-muted-foreground">—</td>
                  <td className="py-4 px-2 xl:px-3 text-sm text-muted-foreground">—</td>
                  <td className="py-4 px-2 xl:px-3 text-sm text-muted-foreground">—</td>
                  <td className="py-4 px-2 xl:px-3 text-sm font-medium text-foreground">
                    {formatCurrencyValue(cashValue ?? 0, userCurrency ?? 'USD', roundNumbers ? { round: true } : undefined)}
                  </td>
                  <td className="py-4 px-2 xl:px-3 text-sm text-muted-foreground">—</td>
                  <td className="py-4 px-2 xl:px-3">
                    <div>
                      <span className="text-sm tabular-nums text-foreground">
                        {cashAllocation.toFixed(roundNumbers ? 0 : 1)}%
                      </span>
                    </div>
                  </td>
                  <td className="hidden xl:table-cell py-4 px-2 xl:px-3" />
                  <td className="py-4 px-2 xl:px-3">
                    <div className="flex items-center justify-end gap-0.5">
                      <Button variant="ghost" size="icon-sm" onClick={onCashClick} title={t('holdingsTableEditCash')} aria-label={t('holdingsTableEditCash')}>
                        <Edit2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              )}
              {onAddClick && (
                <tr>
                  <td colSpan={9} className="p-0 align-middle">
                    <button
                      onClick={onAddClick}
                      className="w-full flex items-center justify-center gap-2 py-5 text-muted-foreground hover:text-primary hover:bg-muted/20 transition-colors group"
                    >
                      <span className="flex items-center justify-center h-8 w-8 rounded-full border border-dashed border-border/60 group-hover:border-primary/50 group-hover:bg-primary/5 transition-colors">
                        <Plus className="h-4 w-4" />
                      </span>
                      <span className="text-sm font-medium">{t('holdingsTableAddHolding')}</span>
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
      <EditHoldingModal
        open={isEditModalOpen}
        onOpenChange={setIsEditModalOpen}
        holding={editingHolding}
      />
      <SellHoldingModal
        open={isSellModalOpen}
        onOpenChange={setIsSellModalOpen}
        holding={sellingHolding}
        currentListingPrice={sellingHolding ? holdingsWithPrices.find((h) => h.id === sellingHolding.id)?.currentPriceNative : undefined}
      />
      <AddPurchaseModal
        open={isAddPurchaseModalOpen}
        onOpenChange={setIsAddPurchaseModalOpen}
        holding={addingPurchaseHolding}
        currentListingPrice={addingPurchaseHolding ? holdingsWithPrices.find((h) => h.id === addingPurchaseHolding.id)?.currentPriceNative : undefined}
      />
      {deletingHolding && (
        <DeleteHoldingDialog
          open={isDeleteDialogOpen}
          onOpenChange={setIsDeleteDialogOpen}
          onConfirm={handleConfirmDelete}
          symbol={deletingHolding.symbol}
          companyName={deletingHolding.companyName}
          isLoading={removeHolding.isPending}
          hasShares={deletingHolding.quantity > 0}
        />
      )}
    </Card>
    </>
  );
}

/**
 * A row's actions as one labelled menu. They were four bare icons (pencil,
 * "$" for sell, "⊕" for add purchase, trash) with Remove sitting among the
 * everyday ones; on phones, where there is no hover title, "$" and "⊕" were
 * guesswork, and the icons squeezed company names to "Microsoft C…".
 * Non-modal, so it never blocks the page (Radix defaults to modal).
 */
function HoldingActionsMenu({
  holding,
  disabled,
  editDisabled,
  busy,
  triggerClassName,
  onEdit,
  onSell,
  onAddPurchase,
  onRemove,
}: {
  holding: Pick<HoldingWithPrice, 'symbol' | 'source'>;
  disabled: boolean;
  editDisabled: boolean;
  busy: boolean;
  triggerClassName?: string;
  onEdit: () => void;
  onSell: () => void;
  onAddPurchase: () => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation('holdings');
  const manual = holding.source === 'manual';
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          disabled={disabled}
          className={triggerClassName}
          aria-label={busy ? t('holdingsTableRemoving') : t('holdingsTableActionsFor', { symbol: holding.symbol })}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MoreHorizontal className="h-4 w-4" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        {manual && (
          <DropdownMenuItem onSelect={onAddPurchase}>
            <PlusCircle />
            {t('holdingsTableAddPurchase')}
          </DropdownMenuItem>
        )}
        {manual && (
          <DropdownMenuItem onSelect={onSell}>
            <DollarSign />
            {t('holdingsTableSellShares')}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onEdit} disabled={editDisabled}>
          <Edit2 />
          {t('holdingsTableEditHolding')}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onRemove}>
          <Trash2 />
          {t('holdingsTableRemoveHolding')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
