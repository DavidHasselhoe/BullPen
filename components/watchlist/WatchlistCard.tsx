'use client';

import Link from 'next/link';
import { X, TrendingUp, TrendingDown, Minus, Bell } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { AlertDialog } from '@/components/alerts/AlertDialog';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { Sparkline } from '@/components/viz/Sparkline';

interface Quote {
  price: number;
  change: number;
  changePercent: number;
  /** From the last-known-price cache, not a fresh quote — render as "last close". */
  stale?: boolean;
}

interface HealthScore {
  score: number;
  grade: string;
  label: string;
}

interface WatchlistCardProps {
  symbol: string;
  company_name: string;
  logo_url?: string | null;
  quote?: Quote | null;
  onRemove: (symbol: string) => void;
  isRemoving?: boolean;
  healthScore?: HealthScore | null;
  nextEarningsDate?: string | null;
  daysToEarnings?: number | null;
  thesisSentiment?: 'bull' | 'bear' | 'neutral' | null;
  sparkline?: number[];
}

function formatPrice(p: number) {
  return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function gradeColor(grade: string) {
  if (grade === 'A') return 'bg-emerald-500/15 text-emerald-500';
  if (grade === 'B') return 'bg-green-500/15 text-green-600';
  if (grade === 'C') return 'bg-amber-500/15 text-amber-500';
  return 'bg-red-500/15 text-red-500';
}

function thesisColor(sentiment: 'bull' | 'bear' | 'neutral') {
  if (sentiment === 'bull') return 'bg-emerald-500';
  if (sentiment === 'bear') return 'bg-red-500';
  return 'bg-muted-foreground';
}


export function WatchlistCard({
  symbol,
  company_name,
  logo_url,
  quote,
  onRemove,
  isRemoving,
  healthScore,
  nextEarningsDate: _nextEarningsDate,
  daysToEarnings,
  thesisSentiment,
  sparkline,
}: WatchlistCardProps) {
  const isUp = (quote?.changePercent ?? 0) > 0;
  const isDown = (quote?.changePercent ?? 0) < 0;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  const showEarnings = daysToEarnings !== null && daysToEarnings !== undefined && daysToEarnings <= 14;

  return (
    <div className="group relative rounded-xl border border-border bg-card transition-all duration-200 hover:border-primary/30 hover:shadow-md">
      {/* Thesis dot */}
      {thesisSentiment && (
        <span
          className={cn('absolute left-2 top-2 z-10 h-1.5 w-1.5 rounded-full', thesisColor(thesisSentiment))}
          title={`Thesis: ${thesisSentiment}`}
        />
      )}

      {/* Hover action buttons: alerts + remove */}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
        <AlertDialog
          symbol={symbol}
          companyName={company_name}
          trigger={
            <button
              type="button"
              onClick={(e) => e.preventDefault()}
              className="rounded-full p-1 text-muted-foreground hover:bg-accent hover:text-foreground transition-all"
              title={`Price alerts for ${symbol}`}
              aria-label={`Manage price alerts for ${symbol}`}
            >
              <Bell className="h-3.5 w-3.5" />
            </button>
          }
        />
        <button
          onClick={(e) => { e.preventDefault(); onRemove(symbol); }}
          disabled={isRemoving}
          className={cn(
            'rounded-full p-1 transition-all',
            'text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
            isRemoving && 'opacity-50 cursor-not-allowed'
          )}
          aria-label={`Remove ${symbol} from watchlist`}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <Link href={slugToAssetPath(symbol)} className="flex flex-col gap-3 p-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <CompanyLogo name={company_name} ticker={symbol} logoUrl={logo_url ?? null} size={36} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground leading-none">{symbol}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{company_name}</p>
          </div>
        </div>

        {/* Price */}
        {quote ? (
          <div className="flex items-end justify-between">
            <span
              className={cn('text-lg font-bold tabular-nums', quote.stale ? 'text-muted-foreground/85' : 'text-foreground')}
              title={quote.stale ? 'Last close — live price unavailable right now' : undefined}
            >
              ${formatPrice(quote.price)}
            </span>
            <div
              className={cn(
                'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full',
                isUp && 'bg-emerald-500/10 text-emerald-500',
                // red-400, not red-500: red-500 measured 4.36:1 on this pill's
                // dark red-tinted background — under WCAG AA. Darker reds get
                // worse here (closer to the background), so go lighter instead.
                isDown && 'bg-red-500/10 text-red-400',
                !isUp && !isDown && 'bg-muted text-muted-foreground',
                quote.stale && 'opacity-60'
              )}
              title={quote.stale ? 'Last close — live price unavailable right now' : undefined}
            >
              <Icon className="h-3 w-3" />
              {isUp ? '+' : ''}{quote.changePercent.toFixed(2)}%
            </div>
          </div>
        ) : (
          <div className="flex items-end justify-between">
            <span className="text-sm text-muted-foreground">Loading...</span>
          </div>
        )}

        {/* Sparkline */}
        {sparkline && sparkline.length > 1 && (
          <div className="-mx-1 -mb-1">
            <Sparkline
              data={sparkline}
              direction={isUp ? 'up' : isDown ? 'down' : 'neutral'}
              area
              className="w-full h-9"
              ariaLabel={`${symbol} recent price trend`}
            />
          </div>
        )}

        {/* Bottom row: health score + earnings countdown */}
        {(healthScore || showEarnings) && (
          <div className="flex items-center justify-between mt-0.5">
            {healthScore ? (
              <span
                className="flex items-center gap-1.5"
                title={`Financial health: ${healthScore.label} (${healthScore.grade}, ${healthScore.score}/100)`}
              >
                <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded', gradeColor(healthScore.grade))}>
                  {healthScore.grade}
                </span>
                <span className="text-xs text-muted-foreground">{healthScore.label}</span>
              </span>
            ) : <span />}

            {showEarnings && daysToEarnings !== null && daysToEarnings !== undefined && (
              <span className={cn(
                'text-xs font-medium',
                daysToEarnings === 0 ? 'text-red-500' : 'text-amber-500'
              )}>
                {daysToEarnings === 0 ? 'Earnings today' : `Earnings in ${daysToEarnings}d`}
              </span>
            )}
          </div>
        )}
      </Link>
    </div>
  );
}
