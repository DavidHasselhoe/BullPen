'use client';

import { memo, useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
import { Trash2, Edit2, DollarSign, PlusCircle, ArrowUpRight, ArrowDownRight, Plus, Search, X, Loader2, Upload, Download } from 'lucide-react';
import { logger } from '@/lib/utils/logger';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { cn } from '@/lib/utils';
import { useHoldingsSparklines } from '@/hooks/use-holdings-sparklines';
import { useRouter } from 'next/navigation';
import { useEntitlements } from '@/hooks/use-entitlements';
import { ProBadge } from '@/components/billing/ProBadge';

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
function SparklineCell({ prices }: { prices: number[] | null | undefined }) {
  if (!prices || prices.length < 2) return <div className="w-16 h-7" />;

  // Downsample to at most 60 points for a clean line.
  const step = Math.max(1, Math.floor(prices.length / 60));
  const pts = prices.filter((_, i) => i % step === 0);

  const isUp = pts[pts.length - 1] >= pts[0];
  const color = isUp ? '#22c55e' : '#ef4444';
  const path = buildSparkPath(pts, 64, 28);

  return (
    <svg width={64} height={28} className="overflow-visible">
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

import { EditHoldingModal } from './EditHoldingModal';
import { SellHoldingModal } from './SellHoldingModal';
import { AddPurchaseModal } from './AddPurchaseModal';
import { DeleteHoldingDialog } from './DeleteHoldingDialog';
import type { HoldingWithPrice } from './types';
import { getSectorLabel } from './HoldingsPieChart';
import type { UserHolding } from '@/lib/types/database';
import { convertCurrency, formatCurrency as formatCurrencyValue, formatNumber as formatNumberUtil, formatPercent as formatPercentUtil, type CurrencyCode } from '@/lib/currency/currency-conversion';
import { useExchangeRates } from '@/hooks/use-exchange-rates';
import { useUserSettings } from '@/hooks/use-user-settings';

// ─── CSV export ───────────────────────────────────────────────────────────────

function csvEscape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function fmtNum(v: number | null | undefined, dp = 2): string {
  return v == null || !Number.isFinite(v) ? '' : v.toFixed(dp);
}

function fmtShares(v: number | null | undefined): string {
  return v == null || !Number.isFinite(v) ? '' : String(Number(v.toFixed(6)));
}

/** Clean, Excel-friendly CSV of the holdings — all monetary values in `currency`. */
function buildHoldingsCsv(rows: HoldingWithPrice[], currency: string): string {
  const headers = [
    'Symbol', 'Company', 'Asset Type', 'Shares', 'Avg Cost', 'Current Price',
    'Cost Basis', 'Market Value', 'Unrealized P/L', 'Unrealized P/L %',
    'Allocation %', 'Date Purchased', 'Currency',
  ];
  const lines = [headers.join(',')];
  for (const h of rows) {
    const costBasis = h.avg_price != null && h.quantity != null ? h.avg_price * h.quantity : null;
    const cells = [
      h.symbol,
      h.company_name ?? '',
      h.asset_type ?? 'stock',
      fmtShares(h.quantity),
      fmtNum(h.avg_price),
      fmtNum(h.currentPrice),
      fmtNum(costBasis),
      fmtNum(h.marketValue),
      fmtNum(h.unrealizedPL),
      fmtNum(h.unrealizedPLPercent),
      fmtNum(h.allocation),
      h.date_purchased ?? '',
      currency,
    ];
    lines.push(cells.map((c) => csvEscape(String(c))).join(','));
  }
  return lines.join('\r\n');
}

function downloadCsv(filename: string, content: string): void {
  // Prepend a BOM (U+FEFF) so Excel reads UTF-8 (accented company names) correctly.
  const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

interface HoldingsTableProps {
  onAddClick?: () => void;
  onImportClick?: () => void;
  holdingsWithPrices?: HoldingWithPrice[];
  /** When set, rows not matching this sector label are dimmed. */
  hoveredSector?: string | null;
  /** True while batch quotes are in-flight — shows shimmer in price columns. */
  isPricesLoading?: boolean;
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
      <td className="py-4 px-4">
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 rounded-lg shrink-0" />
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-3 w-28" />
          </div>
        </div>
      </td>
      <td className="py-4 px-4"><Skeleton className="h-4 w-8" /></td>
      <td className="py-4 px-4"><Skeleton className="h-4 w-16" /></td>
      <td className="py-4 px-4"><Skeleton className="h-4 w-16" /></td>
      <td className="py-4 px-4"><Skeleton className="h-4 w-14" /></td>
      <td className="py-4 px-4"><Skeleton className="h-4 w-20" /></td>
      <td className="py-4 px-4">
        <div className="space-y-1">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-3 w-10" />
        </div>
      </td>
      <td className="py-4 px-4">
        <div className="flex items-center gap-2">
          <Skeleton className="h-1.5 w-14 rounded-full" />
          <Skeleton className="h-4 w-8" />
        </div>
      </td>
      <td className="py-4 px-3"><Skeleton className="h-7 w-16 rounded" /></td>
      <td className="py-4 px-4">
        <div className="flex items-center justify-end gap-2">
          <Skeleton className="h-7 w-7 rounded" />
          <Skeleton className="h-7 w-7 rounded" />
        </div>
      </td>
    </tr>
  );
}

// ─── Day change cell ────────────────────────────────────────────────────────
// The column shows percent (compact, sortable-by-eye across rows); hovering
// reveals the actual currency amount so users don't have to do the math from
// market value × percent themselves to see how much a position moved today.

function DayChangeCell({
  dayChangePercent,
  dayChange,
  isPositive,
  colorClass,
  isPriceStale,
  currency,
  roundNumbers,
}: {
  dayChangePercent: number;
  dayChange: number | undefined;
  isPositive: boolean;
  colorClass: string;
  isPriceStale: boolean | undefined;
  currency: CurrencyCode;
  roundNumbers: boolean;
}) {
  const { t } = useTranslation('holdings');
  const trigger = (
    <div className={cn('flex items-center gap-1 animate-in fade-in duration-300', colorClass)}>
      {isPositive ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
      <span className="text-sm font-medium">
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

  const opts = roundNumbers ? { round: true } : undefined;
  const signedAmount = `${dayChange >= 0 ? '+' : ''}${formatCurrencyValue(dayChange, currency, opts)}`;

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
  maxAllocation: number;
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
  maxAllocation,
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
      <td className="py-4 px-4">
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
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-medium text-foreground group-hover:underline">
                {holding.symbol}
              </span>
              {holding.source === 'snaptrade' && (
                <span className="inline-flex items-center rounded-full bg-blue-500/10 px-1.5 py-0 text-[11px] font-medium text-blue-400 border border-blue-500/20">
                  {t('holdingsTableSynced')}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{holding.company_name}</div>
          </div>
        </Link>
      </td>
      <td className="py-4 px-4 text-sm text-foreground">
        {holding.quantity !== null ? formatNumberUtil(holding.quantity, roundNumbers) : '—'}
      </td>
      <td className="py-4 px-4 text-sm text-foreground">
        {/* Avg price is shown in the asset's native trading currency (USD/NOK/EUR…),
            never converted — it's the cost basis the user actually paid. */}
        {holding.avg_price !== null && holding.avg_price !== undefined
          ? `${holding.trading_currency ?? 'USD'} ${formatNumberUtil(holding.avg_price, roundNumbers)}`
          : '—'}
      </td>
      <td className="py-4 px-4 text-sm font-medium text-foreground">
        {showPriceSkeleton ? <PriceSkeleton /> : holding.currentPrice !== undefined ? (
          <span
            className={cn('animate-in fade-in duration-300', holding.isPriceStale && 'text-muted-foreground/85')}
            title={holding.isPriceStale ? t('holdingsTableStaleLastClose') : undefined}
          >
            {formatCurrencyValue(holding.currentPrice, currency, roundNumbers ? { round: true } : undefined)}
          </span>
        ) : '—'}
      </td>
      <td className="py-4 px-4">
        {showPriceSkeleton ? <PriceSkeleton /> : holding.dayChangePercent !== undefined ? (
          <DayChangeCell
            dayChangePercent={holding.dayChangePercent}
            dayChange={holding.dayChange}
            isPositive={isPositive}
            colorClass={holding.isPriceStale ? `${dayChangeColor} opacity-60` : dayChangeColor}
            isPriceStale={holding.isPriceStale}
            currency={currency}
            roundNumbers={roundNumbers}
          />
        ) : <span className="text-sm text-muted-foreground">—</span>}
      </td>
      <td className="py-4 px-4 text-sm font-medium text-foreground">
        {showPriceSkeleton ? <PriceSkeleton wide /> : holding.marketValue !== undefined ? (
          <span className="animate-in fade-in duration-300">
            {formatCurrencyValue(holding.marketValue, currency, roundNumbers ? { round: true } : undefined)}
          </span>
        ) : '—'}
      </td>
      <td className="py-4 px-4">
        {showPriceSkeleton ? (
          <div className="space-y-1"><PriceSkeleton /><PriceSkeleton /></div>
        ) : holding.unrealizedPL !== undefined ? (
          <div className={cn(plColor, 'animate-in fade-in duration-300')}>
            <div className="text-sm font-medium">
              {formatCurrencyValue(holding.unrealizedPL, currency, roundNumbers ? { round: true } : undefined)}
            </div>
            {holding.unrealizedPLPercent !== undefined && (
              <div className="text-xs">{formatPercentUtil(holding.unrealizedPLPercent, roundNumbers)}</div>
            )}
          </div>
        ) : <span className="text-sm text-muted-foreground">—</span>}
      </td>
      <td className="py-4 px-4">
        {showPriceSkeleton ? (
          <div className="flex items-center gap-2">
            <Skeleton className="h-1.5 w-14 rounded-full" />
            <Skeleton className="h-4 w-8" />
          </div>
        ) : holding.allocation !== undefined ? (
          <div className="flex items-center gap-2.5 min-w-[100px] animate-in fade-in duration-300">
            <div className="w-14 h-1 rounded-full bg-muted/50 overflow-hidden shrink-0">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{ width: `${(holding.allocation / maxAllocation) * 100}%`, backgroundColor: '#a855f7' }}
              />
            </div>
            <span className="text-sm tabular-nums text-foreground">
              {holding.allocation.toFixed(roundNumbers ? 0 : 1)}%
            </span>
          </div>
        ) : <span className="text-sm text-muted-foreground">—</span>}
      </td>
      <td className="py-4 px-3">
        <SparklineCell prices={sparklinePrices} />
      </td>
      <td className="py-4 px-4">
        <div className="flex items-center justify-end gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onEdit(holding)}
            disabled={anyPending || isEditModalOpen}
            title={t('holdingsTableEditHolding')}
          >
            <Edit2 className="h-4 w-4" />
          </Button>
          {holding.source === 'manual' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSell(holding)}
              disabled={anyPending}
              title={t('holdingsTableSellShares')}
            >
              <DollarSign className="h-4 w-4" />
            </Button>
          )}
          {holding.source === 'manual' && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAddPurchase(holding)}
              disabled={anyPending}
              title={t('holdingsTableAddPurchase')}
            >
              <PlusCircle className="h-4 w-4" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onRemove({ id: holding.id, symbol: holding.symbol, companyName: holding.company_name, quantity: holding.quantity ?? 0 })}
            disabled={anyPending}
            title={isDeletingThis ? t('holdingsTableRemoving') : t('holdingsTableRemoveHolding')}
          >
            {isDeletingThis ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          </Button>
        </div>
      </td>
    </tr>
  );
}, (prev, next) =>
  prev.holding.currentPrice === next.holding.currentPrice &&
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
  prev.maxAllocation === next.maxAllocation &&
  prev.sparklinePrices === next.sparklinePrices
);

// ─── Main table ───────────────────────────────────────────────────────────────

export function HoldingsTable({ onAddClick, onImportClick, holdingsWithPrices: externalHoldings, hoveredSector, isPricesLoading }: HoldingsTableProps) {
  const { t } = useTranslation('holdings');
  const { data: holdings, isLoading } = useHoldings();
  const { user } = useAuth();
  const { roundNumbers } = useUserSettings();
  const removeHolding = useRemoveHolding();
  const router = useRouter();
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
    () => (externalHoldings ?? holdings ?? []).map(h => h.symbol),
    [externalHoldings, holdings]
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
  // Guards against showing a raw USD number under a non-USD currency label — currentPrice
  // is never `undefined` (it defaults to the unconverted USD value), so isLoadingPrices
  // alone can't catch this: the price "looks loaded" while still mislabeled.
  const isFxLoading = userCurrency !== null && exchangeRates.isLoading;

  // Only run the internal quote fetch when no live data is provided from the parent page.
  // When externalHoldings is present we skip this to avoid duplicate API calls. Logos are
  // NOT fetched here — they arrive already attached on `holdings` from getHoldings()
  // (lib/holdings/holdings-db.ts), so they render on the first paint instead of waiting
  // on this second, holdings-gated query.
  const quotes = useQuery({
    queryKey: ['holdings-quotes', holdings?.map((h) => h.symbol)],
    queryFn: async () => {
      if (!holdings || holdings.length === 0) return { quotes: {} };

      const quoteMap: Record<string, { price: number; change: number; changePercent: number }> = {};
      const tickers = holdings.map((h) => h.symbol);

      // Batch quotes (throttled server-side to avoid Twelve Data rate limits)
      const batchRes = await fetch('/api/quotes/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: tickers }),
      });
      const batchData = await batchRes.json();
      if (batchRes.status === 429) {
        throw new Error(batchData.error || 'Market data rate limit exceeded. Please try again in a minute.');
      }
      if (batchData.success && batchData.quotes) {
        Object.assign(quoteMap, batchData.quotes);
      }

      return { quotes: quoteMap };
    },
    // Skip the internal fetch entirely when the parent already supplies live data.
    enabled: !externalHoldings && !!holdings && holdings.length > 0,
    staleTime: 3 * 60 * 1000,
    // Keep price cache for 5 min max — stale quotes older than this are garbage-
    // collected so returning users always see a fresh fetch, not stale prices.
    gcTime: 5 * 60 * 1000,
  });

  // True while price data is in-flight — drives skeleton cells in price columns.
  const isLoadingPrices = isPricesLoading !== undefined ? isPricesLoading : quotes.isLoading;

  // Combine holdings with quotes and calculate derived values.
  // Skipped when externalHoldings is provided — the parent already did this work.
  const internalHoldingsWithPrices = useMemo((): HoldingWithPrice[] => {
    if (externalHoldings) return externalHoldings;
    if (!holdings) return [];
    
    const quotesMap = quotes.data?.quotes || {};
    const rates = exchangeRates.data;

    // Calculate total market value (in USD)
    const totalMarketValue = holdings.reduce((sum, holding) => {
      const quote = quotesMap[holding.symbol];
      if (quote && holding.quantity) {
        return sum + quote.price * holding.quantity;
      }
      return sum;
    }, 0);

    return holdings.map((holding) => {
      const quote = quotesMap[holding.symbol];
      const logoUrl = holding.logo_url ?? null;
      
      // All values are in USD initially
      const currentPriceUSD = quote?.price;
      const dayChangeUSD = quote?.change;
      const dayChangePercent = quote?.changePercent;
      
      const marketValueUSD = currentPriceUSD && holding.quantity
        ? currentPriceUSD * holding.quantity
        : undefined;
      
      const unrealizedPLUSD = currentPriceUSD && holding.avg_price && holding.quantity
        ? (currentPriceUSD - holding.avg_price) * holding.quantity
        : undefined;
      
      const unrealizedPLPercent = currentPriceUSD && holding.avg_price
        ? ((currentPriceUSD - holding.avg_price) / holding.avg_price) * 100
        : undefined;
      
      const allocation = marketValueUSD && totalMarketValue > 0
        ? (marketValueUSD / totalMarketValue) * 100
        : undefined;

      // Convert to user's preferred currency if specified
      let currentPrice: number | undefined = currentPriceUSD;
      let dayChange: number | undefined = dayChangeUSD;
      let marketValue: number | undefined = marketValueUSD;
      let unrealizedPL: number | undefined = unrealizedPLUSD;
      let avg_price: number | null = holding.avg_price;
      
      if (userCurrency && rates) {
        currentPrice = currentPriceUSD ? convertCurrency(currentPriceUSD, 'USD', userCurrency, rates) : undefined;
        dayChange = dayChangeUSD ? convertCurrency(dayChangeUSD, 'USD', userCurrency, rates) : undefined;
        marketValue = marketValueUSD ? convertCurrency(marketValueUSD, 'USD', userCurrency, rates) : undefined;
        unrealizedPL = unrealizedPLUSD ? convertCurrency(unrealizedPLUSD, 'USD', userCurrency, rates) : undefined;
        avg_price = holding.avg_price !== null ? convertCurrency(holding.avg_price, 'USD', userCurrency, rates) : null;
      }

      return {
        ...holding,
        currentPrice,
        currentPriceUSD,
        dayChange,
        dayChangePercent,
        marketValue,
        unrealizedPL,
        unrealizedPLPercent,
        allocation,
        logoUrl,
        avg_price,
      };
    });
  }, [externalHoldings, holdings, quotes.data, exchangeRates.data, userCurrency]);

  // Alias so the rest of the component is unchanged.
  const holdingsWithPrices = internalHoldingsWithPrices;

  const maxAllocation = useMemo(
    () => Math.max(...holdingsWithPrices.map((h) => h.allocation ?? 0), 1),
    [holdingsWithPrices]
  );

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
  const handleExport = useCallback(() => {
    if (!isPro) { router.push('/upgrade'); return; }
    if (sortedHoldings.length === 0) return;
    const csv = buildHoldingsCsv(sortedHoldings, userCurrency ?? 'USD');
    downloadCsv(`bullpen-holdings-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }, [isPro, router, sortedHoldings, userCurrency]);

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
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">{t('holdingsTableColSymbol')}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">{t('holdingsTableColQuantity')}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground"><TermTooltip term="Avg Price" /></th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">{t('holdingsTableColCurrentPrice')}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground"><TermTooltip term="Day Change" /></th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">{t('holdingsTableColMarketValue')}</th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground"><TermTooltip term="Unrealized P/L" /></th>
                    <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">{t('holdingsTableColAllocation')}</th>
                    <th className="py-3 px-4" />
                    <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">{t('holdingsTableColActions')}</th>
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
          <CardTitle>{t('holdingsTableTitle')}</CardTitle>
          <div className="flex items-center gap-2">
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
              <button
                onClick={handleExport}
                title={isPro ? t('holdingsTableExportTitle') : t('holdingsTableExportProOnlyTitle')}
                className="flex items-center gap-1.5 h-8 rounded-lg border border-border/60 bg-muted/30 px-3 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-border hover:bg-muted/60 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                {t('holdingsTableExportCsv')}
                {!isPro && <ProBadge className="ml-0.5" />}
              </button>
            )}
            <SoldPositionsModal />
          {/* Search */}
          <div className="relative w-full sm:w-56">
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
        <div className="space-y-2 md:hidden">
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
                      <span className="text-sm font-semibold text-foreground">{holding.symbol}</span>
                      <span className="block truncate text-xs text-muted-foreground">{holding.company_name}</span>
                    </div>
                  </Link>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => handleEditRow(holding)} disabled={removeHolding.isPending || isEditModalOpen} title={t('holdingsTableEditHolding')} className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    {holding.source === 'manual' && (
                      <button onClick={() => handleSellRow(holding)} disabled={removeHolding.isPending} title={t('holdingsTableSellShares')} className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground">
                        <DollarSign className="h-4 w-4" />
                      </button>
                    )}
                    {holding.source === 'manual' && (
                      <button onClick={() => handleAddPurchaseRow(holding)} disabled={removeHolding.isPending} title={t('holdingsTableAddPurchase')} className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 hover:text-foreground">
                        <PlusCircle className="h-4 w-4" />
                      </button>
                    )}
                    <button onClick={() => handleRemoveRow({ id: holding.id, symbol: holding.symbol, companyName: holding.company_name, quantity: holding.quantity ?? 0 })} disabled={removeHolding.isPending} title={t('holdingsTableRemoveHolding')} className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-400">
                      {removeHolding.isPending && deletingHolding?.id === holding.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <HoldingField
                    label={t('holdingsTableFieldPrice')}
                    valueClass={holding.isPriceStale ? 'text-muted-foreground/85' : undefined}
                    title={holding.isPriceStale ? t('holdingsTableStaleLastClose') : undefined}
                    value={holding.currentPrice !== undefined ? formatCurrencyValue(holding.currentPrice, ccy, opts) : '—'}
                  />
                  <HoldingField
                    label={t('holdingsTableFieldDay')}
                    valueClass={cn(isPos ? 'text-green-500' : 'text-red-500', holding.isPriceStale && 'opacity-60')}
                    title={holding.isPriceStale ? t('holdingsTableStaleLastClose') : undefined}
                    value={holding.dayChangePercent !== undefined ? formatPercentUtil(holding.dayChangePercent, roundNumbers) : '—'}
                  />
                  <HoldingField label={t('holdingsTableFieldValue')} value={holding.marketValue !== undefined ? formatCurrencyValue(holding.marketValue, ccy, opts) : '—'} />
                  <HoldingField label={t('holdingsTableFieldPl')} valueClass={plPos ? 'text-green-500' : 'text-red-500'} value={holding.unrealizedPL !== undefined ? formatCurrencyValue(holding.unrealizedPL, ccy, opts) : '—'} />
                </div>
              </div>
            );
          })}
          {onAddClick && (
            <button onClick={onAddClick} className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border/60 py-3 text-sm font-medium text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary">
              <Plus className="h-4 w-4" /> {t('holdingsTableAddHolding')}
            </button>
          )}
        </div>

        <div className="hidden md:block overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border/50">
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  <button
                    onClick={() => handleSort('symbol')}
                    className="hover:text-foreground transition-colors"
                  >
                    {t('holdingsTableColSymbol')}
                  </button>
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  {t('holdingsTableColQuantity')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  <TermTooltip term="Avg Price" />
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  {t('holdingsTableColCurrentPrice')}
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  <TermTooltip term="Day Change" />
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  <button
                    onClick={() => handleSort('marketValue')}
                    className="hover:text-foreground transition-colors"
                  >
                    {t('holdingsTableColMarketValue')}
                  </button>
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  <TermTooltip term="Unrealized P/L" />
                </th>
                <th className="text-left py-3 px-4 text-sm font-medium text-muted-foreground">
                  <button
                    onClick={() => handleSort('allocation')}
                    className="hover:text-foreground transition-colors"
                  >
                    {t('holdingsTableColAllocation')}
                  </button>
                </th>
                <th className="py-3 px-4" />
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">
                  {t('holdingsTableColActions')}
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredHoldings.length === 0 && search && (
                <tr>
                  <td colSpan={10} className="py-8 text-center text-sm text-muted-foreground">
                    {t('holdingsTableNoMatch', { search })}
                  </td>
                </tr>
              )}
              {filteredHoldings.map((holding, rowIndex) => (
                <HoldingRow
                  key={holding.id}
                  holding={holding}
                  rowIndex={rowIndex}
                  maxAllocation={maxAllocation}
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
              {onAddClick && (
                <tr>
                  <td colSpan={10} className="p-0 align-middle">
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
        currentPriceUSD={sellingHolding ? holdingsWithPrices.find((h) => h.id === sellingHolding.id)?.currentPriceUSD : undefined}
      />
      <AddPurchaseModal
        open={isAddPurchaseModalOpen}
        onOpenChange={setIsAddPurchaseModalOpen}
        holding={addingPurchaseHolding}
        currentPriceUSD={addingPurchaseHolding ? holdingsWithPrices.find((h) => h.id === addingPurchaseHolding.id)?.currentPriceUSD : undefined}
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
