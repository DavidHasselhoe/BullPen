'use client';

/**
 * InsiderTransactionsCard — net-flow-first insider activity.
 *
 * Leads with a FlowBar of total $ bought vs $ sold + one insight sentence.
 * The sentiment pill is value-based (dollars), not count-based — ten small
 * buys no longer read as "bullish" against one massive sale. Counts remain
 * as secondary text.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ProBadge } from '@/components/billing/ProBadge';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import { useEntitlements } from '@/hooks/use-entitlements';
import { TrendingUp, TrendingDown, Minus, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { FlowBar } from '@/components/viz/FlowBar';
import type { InsiderTransaction } from '@/lib/twelvedata/twelvedata-client';

type TypeConfig = ReturnType<typeof getTypeConfig>[keyof ReturnType<typeof getTypeConfig>];
type TypeFilter = 'all' | InsiderTransaction['transaction_type'];

interface InsiderResponse {
  success: boolean;
  data?: InsiderTransaction[];
  error?: string;
}

function fmtValue(v: number): string {
  if (!v || isNaN(v)) return '—';
  if (v >= 1_000_000_000) return `$${(v / 1_000_000_000).toFixed(2)}B`;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toLocaleString('en-US')}`;
}

function fmtShares(v: number): string {
  if (!v || isNaN(v)) return '—';
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
  return v.toLocaleString();
}

function fmtDate(dateStr: string): string {
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

function getTypeConfig(t: TFunction) {
  return {
    buy: {
      icon: TrendingUp,
      label: t('insiderTypePurchase'),
      plainLabel: t('insiderTypeBought'),
      color: 'text-emerald-500',
      badgeClass: 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20',
    },
    sell: {
      icon: TrendingDown,
      label: t('insiderTypeSale'),
      plainLabel: t('insiderTypeSold'),
      color: 'text-red-500',
      badgeClass: 'bg-red-500/10 text-red-500 border-red-500/20',
    },
    other: {
      icon: Minus,
      label: t('insiderTypeOther'),
      plainLabel: t('insiderTypeOther'),
      color: 'text-muted-foreground',
      badgeClass: 'bg-muted text-muted-foreground border-border',
    },
  } as const;
}

const INITIAL_SHOW = 8;

/** One insider-transaction row — shared by the card's preview list and the "view all" modal. */
function InsiderRow({ tx, cfg, isSimplified }: { tx: InsiderTransaction; cfg: TypeConfig; isSimplified: boolean }) {
  const Icon = cfg.icon;
  return (
    <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_80px_100px_90px] items-center gap-x-4 py-3">
      {/* Insider info */}
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {tx.full_name
            .split(' ')
            .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
            .join(' ')}
        </p>
        <p className="text-xs text-muted-foreground truncate">{tx.position}</p>
        <p className="text-xs text-muted-foreground/80 mt-0.5">{fmtDate(tx.date_reported)}</p>
      </div>

      {/* Type badge */}
      <div className="hidden sm:flex justify-end">
        <Badge
          variant="outline"
          className={cn('text-xs gap-1 font-medium px-2 py-0.5 h-auto', cfg.badgeClass)}
        >
          <Icon className="h-3 w-3" />
          {isSimplified ? cfg.plainLabel : cfg.label}
        </Badge>
      </div>

      {/* Shares */}
      <div className="hidden sm:block text-right">
        <span className={cn('text-sm font-medium tabular-nums', cfg.color)}>
          {tx.transaction_type === 'sell' ? '-' : tx.transaction_type === 'buy' ? '+' : ''}
          {fmtShares(Math.abs(tx.shares))}
        </span>
      </div>

      {/* Value + mobile type badge */}
      <div className="text-right">
        <span className={cn('text-sm font-semibold tabular-nums', cfg.color)}>
          {fmtValue(Math.abs(tx.value))}
        </span>
        <div className="sm:hidden mt-0.5">
          <Badge
            variant="outline"
            className={cn('text-xs gap-1 font-medium px-1.5 py-0.5 h-auto', cfg.badgeClass)}
          >
            <Icon className="h-2.5 w-2.5" />
            {isSimplified ? cfg.plainLabel : cfg.label}
          </Badge>
        </div>
      </div>
    </div>
  );
}

const ROW_HEADER_CLASS = 'grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_80px_100px_90px] items-center gap-x-4 pb-2 border-b border-border text-xs font-medium text-muted-foreground';

export function InsiderTransactionsCard({ ticker }: { ticker: string }) {
  const { t } = useTranslation('stock');
  const { isSimplified } = useExperienceLevel();
  const { isPro } = useEntitlements();
  const [modalOpen, setModalOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [requested, setRequested] = useState(false);
  const TYPE_CONFIG = getTypeConfig(t);

  const { data, isLoading } = useQuery<InsiderResponse>({
    queryKey: ['insider-transactions', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/insider-transactions`);
      return res.json();
    },
    enabled: requested && isPro,
    staleTime: 7 * 24 * 60 * 60 * 1000,
    gcTime: 7 * 24 * 60 * 60 * 1000,
  });

  // Gate: show a prompt until the user explicitly requests the data.
  // Pro-only feature — the API enforces this too, but a free user shouldn't
  // even see a "View" button that silently 403s.
  if (!requested || !isPro) {
    return (
      <Card className="mb-8">
        <CardContent className="flex items-center justify-between gap-4 py-4">
          <div className="flex items-center gap-2.5 min-w-0">
            <Users className="h-4 w-4 text-muted-foreground shrink-0" />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                {t('insiderCardTitle')}
                {!isPro && <ProBadge />}
              </p>
              <p className="text-xs text-muted-foreground/85">
                {isSimplified
                  ? t('insiderSimplifiedDescription')
                  : t('insiderAdvancedDescription')}
              </p>
            </div>
          </div>
          {isPro ? (
            <button
              onClick={() => setRequested(true)}
              className="shrink-0 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors whitespace-nowrap"
            >
              {t('insiderViewButton')}
            </button>
          ) : (
            <Link
              href="/upgrade"
              className="shrink-0 rounded-lg border border-primary/30 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary hover:bg-primary/10 transition-colors whitespace-nowrap"
            >
              {t('insiderUpgradeButton')}
            </Link>
          )}
        </CardContent>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Users className="h-4 w-4" />
            {t('insiderCardTitle')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-14 w-full rounded-lg" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between gap-4">
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-36" />
                <Skeleton className="h-3 w-24" />
              </div>
              <div className="flex items-center gap-3">
                <Skeleton className="h-5 w-16 rounded-full" />
                <Skeleton className="h-3.5 w-20" />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!data?.success) return null;

  const transactions = data.data ?? [];
  if (transactions.length === 0) return null;

  const visible = transactions.slice(0, INITIAL_SHOW);

  // Value-based flow summary
  const buys = transactions.filter((t) => t.transaction_type === 'buy');
  const sells = transactions.filter((t) => t.transaction_type === 'sell');
  const others = transactions.filter((t) => t.transaction_type === 'other');
  const buyValue = buys.reduce((sum, t) => sum + Math.abs(t.value || 0), 0);
  const sellValue = sells.reduce((sum, t) => sum + Math.abs(t.value || 0), 0);
  const net = buyValue - sellValue;
  const sentiment = net > 0 ? 'bullish' : net < 0 ? 'bearish' : 'neutral';
  const netAbs = fmtValue(Math.abs(net));
  const tradeCount = buys.length + sells.length;

  // Client-side only — every row is already in `transactions` from the one
  // fetch above, so switching filters never triggers another API call.
  const FILTERS: { key: TypeFilter; label: string; count: number }[] = [
    { key: 'all', label: t('insiderFilterAll'), count: transactions.length },
    { key: 'buy', label: TYPE_CONFIG.buy.plainLabel, count: buys.length },
    { key: 'sell', label: TYPE_CONFIG.sell.plainLabel, count: sells.length },
    { key: 'other', label: TYPE_CONFIG.other.plainLabel, count: others.length },
  ].filter((f) => f.key === 'all' || f.count > 0);
  const filteredForModal = typeFilter === 'all' ? transactions : transactions.filter((t) => t.transaction_type === typeFilter);

  const insight =
    tradeCount === 0
      ? null
      : net === 0
        ? t('insiderInsightBalanced', { count: tradeCount })
        : net > 0
          ? t('insiderInsightNetBought', { amount: netAbs, count: tradeCount })
          : t('insiderInsightNetSold', { amount: netAbs, count: tradeCount });

  return (
    <Card className="mb-8">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <div>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              {t('insiderCardTitle')}
            </CardTitle>
            {isSimplified ? (
              <p className="text-xs text-muted-foreground mt-1">
                {t('insiderSimplifiedExplainer')}
              </p>
            ) : (
              <p className="text-xs text-muted-foreground mt-1">
                {t('insiderAdvancedExplainer')}
              </p>
            )}
          </div>
          {/* Value-based sentiment pill */}
          <div className="flex items-center gap-2 text-xs">
            <span className={cn(
              'flex items-center gap-1 rounded-full border px-2.5 py-1 font-medium tabular-nums',
              sentiment === 'bullish' ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20' :
              sentiment === 'bearish' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
              'bg-muted text-muted-foreground border-border'
            )}>
              {sentiment === 'bullish' ? <TrendingUp className="h-3 w-3" /> : sentiment === 'bearish' ? <TrendingDown className="h-3 w-3" /> : <Minus className="h-3 w-3" />}
              {sentiment === 'neutral' ? t('insiderSentimentBalanced') : t('insiderSentimentNet', { sign: net > 0 ? '+' : '−', amount: netAbs })}
            </span>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        {/* Money-flow summary */}
        {(buyValue > 0 || sellValue > 0) && (
          <div className="mb-4 rounded-lg border border-border/50 bg-accent/20 px-4 py-3">
            <FlowBar
              inflow={buyValue}
              inLabel={t('insiderFlowBought', { amount: buyValue > 0 ? fmtValue(buyValue) : '$0', count: buys.length })}
              outflow={sellValue}
              outLabel={t('insiderFlowSold', { amount: sellValue > 0 ? fmtValue(sellValue) : '$0', count: sells.length })}
              srLabel={t('insiderFlowSrLabel', { bought: fmtValue(buyValue), sold: fmtValue(sellValue) })}
            />
            {insight && <p className="mt-2 text-xs text-muted-foreground">{insight}</p>}
          </div>
        )}

        {/* Table header */}
        <div className={ROW_HEADER_CLASS}>
          <span>{t('insiderColumnInsider')}</span>
          <span className="hidden sm:block text-right">{t('insiderColumnType')}</span>
          <span className="hidden sm:block text-right">{t('insiderColumnShares')}</span>
          <span className="text-right">{t('insiderColumnValue')}</span>
        </div>

        <div className="divide-y divide-border/50">
          {visible.map((tx, i) => (
            <InsiderRow key={i} tx={tx} cfg={TYPE_CONFIG[tx.transaction_type]} isSimplified={isSimplified} />
          ))}
        </div>

        {transactions.length > INITIAL_SHOW && (
          <button
            onClick={() => setModalOpen(true)}
            className="mt-3 w-full rounded-lg border border-border py-2 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            {t('insiderViewAllTransactions', { count: transactions.length })}
          </button>
        )}
      </CardContent>

      {/* Full, filterable list — a modal instead of expanding the page inline, since a
          heavily-traded stock can have hundreds of filings. */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-2xl">
          <DialogHeader className="px-6 pt-6 pb-4">
            <DialogTitle>{t('insiderModalTitle', { ticker })}</DialogTitle>
            <DialogDescription>{t('insiderAdvancedExplainer')}</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-center gap-1.5 px-6 pb-3">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setTypeFilter(f.key)}
                className={cn(
                  'rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums transition-colors',
                  typeFilter === f.key
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground'
                )}
              >
                {f.label} ({f.count})
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <div className={cn(ROW_HEADER_CLASS, 'sticky top-0 bg-background')}>
              <span>{t('insiderColumnInsider')}</span>
              <span className="hidden sm:block text-right">{t('insiderColumnType')}</span>
              <span className="hidden sm:block text-right">{t('insiderColumnShares')}</span>
              <span className="text-right">{t('insiderColumnValue')}</span>
            </div>
            {filteredForModal.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">{t('insiderFilterEmpty')}</p>
            ) : (
              <div className="divide-y divide-border/50">
                {filteredForModal.map((tx, i) => (
                  <InsiderRow key={i} tx={tx} cfg={TYPE_CONFIG[tx.transaction_type]} isSimplified={isSimplified} />
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
