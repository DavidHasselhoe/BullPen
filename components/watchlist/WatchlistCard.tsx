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

interface WatchlistCardProps {
  symbol: string;
  company_name: string;
  quote?: Quote | null;
  alerts_enabled?: boolean;
  onRemove: (symbol: string) => void;
  onToggleAlert?: (symbol: string, enabled: boolean) => void;
  isRemoving?: boolean;
  isTogglingAlert?: boolean;
}

function formatPrice(p: number) {
  return p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
}: WatchlistCardProps) {
  const isUp = (quote?.changePercent ?? 0) > 0;
  const isDown = (quote?.changePercent ?? 0) < 0;
  const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;

  return (
    <div className="group relative rounded-xl border border-border bg-card transition-all duration-200 hover:border-primary/30 hover:shadow-md">
      {/* Hover action buttons: remove + alert toggle */}
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
      </Link>
    </div>
  );
}
