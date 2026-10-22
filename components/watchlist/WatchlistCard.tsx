'use client';

import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { X, TrendingUp, TrendingDown, Minus, Bell, Target } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { AlertDialog } from '@/components/alerts/AlertDialog';
import { StockPlanDialog, formatQuotePrice } from './StockPlan';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { Sparkline } from '@/components/viz/Sparkline';
import { useIntlLocale } from '@/hooks/use-intl-locale';
import { displayCompanyName } from '@/lib/market-data/company-name';

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
  /** Short, properly cased name from the API; falls back to cleaning company_name. */
  display_name?: string | null;
  logo_url?: string | null;
  quote?: Quote | null;
  onRemove: (symbol: string) => void;
  isRemoving?: boolean;
  healthScore?: HealthScore | null;
  nextEarningsDate?: string | null;
  daysToEarnings?: number | null;
  thesisSentiment?: 'bull' | 'bear' | 'neutral' | null;
  sparkline?: number[];
  /** The line starts at the last session's open and runs to now (today's regular session is under an hour old). */
  sparklineIsPreviousSession?: boolean;
  /** The user's own thesis text, for the plan. */
  thesisText?: string | null;
  /** The plan's buy-below price: the user's highest active price_below alert. */
  buyBelow?: number | null;
  week52Low?: number | null;
  week52High?: number | null;
}

function gradeColor(grade: string) {
  if (grade === 'A') return 'bg-emerald-500/15 text-emerald-500';
  if (grade === 'B') return 'bg-green-500/15 text-green-600';
  if (grade === 'C') return 'bg-amber-500/15 text-amber-500';
  return 'bg-red-500/15 text-red-500';
}

function thesisColor(sentiment: 'bull' | 'bear' | 'neutral') {
  if (sentiment === 'bull') return 'text-emerald-500';
  if (sentiment === 'bear') return 'text-red-400';
  return 'text-muted-foreground';
}

const THESIS_KEY = { bull: 'watchlistThesisBull', bear: 'watchlistThesisBear', neutral: 'watchlistThesisNeutral' } as const;


export function WatchlistCard({
  symbol,
  company_name,
  display_name,
  logo_url,
  quote,
  onRemove,
  isRemoving,
  healthScore,
  nextEarningsDate: _nextEarningsDate,
  daysToEarnings,
  thesisSentiment,
  sparkline,
  sparklineIsPreviousSession,
  thesisText,
  buyBelow,
  week52Low,
  week52High,
}: WatchlistCardProps) {
  const { t } = useTranslation('watchlist');
  const locale = useIntlLocale();
  const isUp = (quote?.changePercent ?? 0) > 0;
  const isDown = (quote?.changePercent ?? 0) < 0;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  const showEarnings = daysToEarnings !== null && daysToEarnings !== undefined && daysToEarnings <= 14;

  return (
    <div className="group relative rounded-xl border border-border bg-card transition-all duration-200 hover:border-primary/30 hover:shadow-md">
      {/* Alerts + remove. Revealed on hover, but always shown on touch screens
          (no hover there) and whenever focus is inside the card, so a phone or
          keyboard can still reach them. */}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100">
        <StockPlanDialog
          symbol={symbol}
          companyName={company_name}
          price={quote?.price ?? null}
          week52Low={week52Low ?? null}
          week52High={week52High ?? null}
          thesisText={thesisText ?? null}
          thesisSentiment={thesisSentiment ?? null}
          trigger={
            <button
              type="button"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title={t('planButtonTitle', { symbol })}
              aria-label={t('planButtonTitle', { symbol })}
            >
              <Target className="h-3.5 w-3.5" />
            </button>
          }
        />
        <AlertDialog
          symbol={symbol}
          companyName={company_name}
          trigger={
            <button
              type="button"
              onClick={(e) => e.preventDefault()}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              title={t('watchlistAlertsTitle', { symbol })}
              aria-label={t('watchlistAlertsAriaLabel', { symbol })}
            >
              <Bell className="h-3.5 w-3.5" />
            </button>
          }
        />
        <button
          onClick={(e) => { e.preventDefault(); onRemove(symbol); }}
          disabled={isRemoving}
          className={cn(
            'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
            'text-muted-foreground hover:bg-destructive/10 hover:text-destructive',
            isRemoving && 'opacity-50 cursor-not-allowed'
          )}
          aria-label={t('watchlistRemoveFromWatchlistAriaLabel', { symbol })}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <Link href={slugToAssetPath(symbol)} className="flex flex-col gap-3 p-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <CompanyLogo name={company_name} ticker={symbol} logoUrl={logo_url ?? null} size={36} />
          <div className="min-w-0 flex-1 [@media(hover:none)]:pr-24">
            {/* clamp-ok: a company name is a short label; the full legal name is on hover. */}
            <p className="flex items-baseline gap-1.5 text-sm font-semibold text-foreground leading-none" title={company_name || undefined}>
              <span className="truncate">{display_name || displayCompanyName(company_name || symbol, symbol)}</span>
              {thesisSentiment && (
                <span className={cn('text-xs font-medium', thesisColor(thesisSentiment))}>
                  {t(THESIS_KEY[thesisSentiment])}
                </span>
              )}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{symbol}</p>
          </div>
        </div>

        {/* Price */}
        {quote ? (
          <div className="flex items-end justify-between">
            <span
              className={cn('font-mono text-lg font-bold tabular-nums', quote.stale ? 'text-muted-foreground' : 'text-foreground')}
              title={quote.stale ? t('watchlistStaleTitle') : undefined}
            >
              {formatQuotePrice(quote.price, symbol, locale)}
            </span>
            <div
              className={cn(
                'flex items-center gap-1 font-mono text-xs font-medium tabular-nums px-2 py-1 rounded-full',
                isUp && 'bg-emerald-500/10 text-emerald-500',
                // red-400, not red-500: red-500 measured 4.36:1 on this pill's
                // dark red-tinted background — under WCAG AA. Darker reds get
                // worse here (closer to the background), so go lighter instead.
                isDown && 'bg-red-500/10 text-red-400',
                !isUp && !isDown && 'bg-muted text-muted-foreground',
                quote.stale && 'opacity-60'
              )}
              title={quote.stale ? t('watchlistStaleTitle') : undefined}
            >
              <Icon className="h-3 w-3" />
              {isUp ? '+' : ''}{quote.changePercent.toFixed(2)}%
            </div>
          </div>
        ) : (
          <div className="flex items-end justify-between">
            <span className="text-sm text-muted-foreground">{t('watchlistLoading')}</span>
          </div>
        )}

        {/* Sparkline */}
        {sparkline && sparkline.length > 1 && (
          <div className="-mx-1 -mb-1">
            <Sparkline
              data={sparkline}
              // Today's direction; a flat badge (often no pre-market trades yet) lets the line colour itself.
              direction={isUp ? 'up' : isDown ? 'down' : undefined}
              // The previous close the badge measures from, so its % is the
              // visible gap between this dashed line and the end of the line.
              baseline={sparklineIsPreviousSession && quote ? quote.price - quote.change : undefined}
              area
              className="w-full h-9"
              ariaLabel={sparklineIsPreviousSession
                ? t('watchlistSparklineSinceLastOpenAriaLabel', { symbol })
                : t('watchlistSparklineAriaLabel', { symbol })}
            />
          </div>
        )}

        {/* The plan's buy-below price, only once one is set. Ink, not emerald or
            Info Blue: reaching your price is a fact, not a gain, and Info Blue
            is for status pills (DESIGN.md). Weight carries the change. */}
        {buyBelow != null && quote && (
          <p className={cn('text-xs tabular-nums', quote.price <= buyBelow ? 'font-medium text-foreground' : 'text-muted-foreground')}>
            {quote.price <= buyBelow
              ? t('planCardReached', { price: formatQuotePrice(buyBelow, symbol, locale) })
              : t('planCardDistance', { price: formatQuotePrice(buyBelow, symbol, locale), pct: ((quote.price / buyBelow - 1) * 100).toFixed(1) })}
          </p>
        )}

        {/* Bottom row: health score + earnings countdown */}
        {(healthScore || showEarnings) && (
          <div className="flex items-center justify-between mt-0.5">
            {healthScore ? (
              <span
                className="flex items-center gap-1.5"
                title={t('watchlistHealthTitle', { label: healthScore.label, grade: healthScore.grade, score: healthScore.score })}
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
                {daysToEarnings === 0 ? t('watchlistEarningsToday') : t('watchlistEarningsInDays', { days: daysToEarnings })}
              </span>
            )}
          </div>
        )}
      </Link>
    </div>
  );
}
