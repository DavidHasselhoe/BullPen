'use client';

import Link from 'next/link';
import { X, TrendingUp, TrendingDown, Minus, Bell, BellOff } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { cn } from '@/lib/utils';

interface Quote {
  price: number;
  change: number;
  changePercent: number;
}

interface HealthScore {
  score: number;
  grade: string;
  label: string;
}

interface WatchlistCardProps {
  symbol: string;
  company_name: string;
  quote?: Quote | null;
  alerts_enabled?: boolean;
  onRemove: (symbol: string) => void;
  onToggleAlert?: (symbol: string, enabled: boolean) => void;
  isRemoving?: boolean;
  isTogglingAlert?: boolean;
  healthScore?: HealthScore | null;
  nextEarningsDate?: string | null;
  daysToEarnings?: number | null;
  thesisSentiment?: 'bull' | 'bear' | 'neutral' | null;
  sparkline?: number[];
}

function Sparkline({ data, isUp, symbol }: { data: number[]; isUp: boolean; symbol: string }) {
  if (data.length < 2) return null;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const W = 100;
  const H = 36;
  const pts = data.map((v, i) => [
    (i / (data.length - 1)) * W,
    H - ((v - min) / range) * (H * 0.85),
  ]);
  const linePath = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
  const areaPath = `${linePath} L${W},${H} L0,${H} Z`;
  const color = isUp ? '#22c55e' : '#ef4444';
  const gradId = `spark-${symbol}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-9">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.2} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradId})`} />
      <path d={linePath} stroke={color} strokeWidth={1.5} fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
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
  quote,
  alerts_enabled = true,
  onRemove,
  onToggleAlert,
  isRemoving,
  isTogglingAlert,
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

      {/* Hover action buttons: alert toggle + remove */}
      <div className="absolute right-2 top-2 z-10 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
        {onToggleAlert && (
          <button
            onClick={(e) => { e.preventDefault(); onToggleAlert(symbol, !alerts_enabled); }}
            disabled={isTogglingAlert}
            className={cn(
              'rounded-full p-1 transition-all',
              'text-muted-foreground hover:bg-accent',
              alerts_enabled
                ? 'hover:text-foreground'
                : 'text-destructive/70 hover:text-destructive',
              isTogglingAlert && 'opacity-50 cursor-not-allowed'
            )}
            title={alerts_enabled ? 'Disable price alerts for this stock' : 'Enable price alerts for this stock'}
            aria-label={`${alerts_enabled ? 'Disable' : 'Enable'} alerts for ${symbol}`}
          >
            {alerts_enabled
              ? <Bell className="h-3.5 w-3.5" />
              : <BellOff className="h-3.5 w-3.5" />
            }
          </button>
        )}
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

      <Link href={`/stock/${symbol}`} className="flex flex-col gap-3 p-4">
        {/* Header */}
        <div className="flex items-center gap-3">
          <CompanyLogo name={company_name} ticker={symbol} logoUrl={null} size={36} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-foreground leading-none">{symbol}</p>
            <p className="text-xs text-muted-foreground truncate mt-0.5">{company_name}</p>
          </div>
          {/* Alert-off indicator (always visible, subtle) */}
          {!alerts_enabled && (
            <BellOff className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
          )}
        </div>

        {/* Price */}
        {quote ? (
          <div className="flex items-end justify-between">
            <span className="text-lg font-bold text-foreground tabular-nums">
              ${formatPrice(quote.price)}
            </span>
            <div className={cn(
              'flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full',
              isUp && 'bg-emerald-500/10 text-emerald-500',
              isDown && 'bg-red-500/10 text-red-500',
              !isUp && !isDown && 'bg-muted text-muted-foreground'
            )}>
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
            <Sparkline data={sparkline} isUp={isUp} symbol={symbol} />
          </div>
        )}

        {/* Bottom row: health score + earnings countdown */}
        {(healthScore || showEarnings) && (
          <div className="flex items-center justify-between mt-0.5">
            {healthScore ? (
              <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded', gradeColor(healthScore.grade))}>
                {healthScore.grade}
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
