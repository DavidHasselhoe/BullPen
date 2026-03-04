'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import type { FundamentalChange } from '@/hooks/use-discover';

/** Maps trend/signal types to human-readable financial signal labels */
const SIGNAL_TYPE_LABELS: Record<string, string> = {
  sustained_growth: 'Growth sustained',
  sustained_decline: 'Decline sustained',
  acceleration: 'Growth acceleration',
  deceleration: 'Growth deceleration',
  volatility_increase: 'Volatility spike',
  divergence: 'Divergence',
  earnings_surprise: 'Earnings surprise',
  guidance_change: 'Guidance change',
  risk_alert: 'Risk alert',
  unusual_disclosure: 'Unusual disclosure',
  management_change: 'Management change',
  legal_event: 'Legal event',
  competitive_threat: 'Competitive threat',
  growth_opportunity: 'Growth opportunity',
};

function getSignalLabel(change: FundamentalChange): string {
  const type = change.trend?.trend_type || change.signal?.signal_type;
  const label = type ? SIGNAL_TYPE_LABELS[type] || type.replace(/_/g, ' ') : null;
  const sentiment = change.direction === 'positive' ? 'Positive' : change.direction === 'negative' ? 'Negative' : 'Neutral';
  return label ? `${sentiment} • ${label}` : sentiment;
}

interface FundamentalChangeCardProps {
  change: FundamentalChange;
}

export function FundamentalChangeCard({ change }: FundamentalChangeCardProps) {
  const getDirectionConfig = (direction: string) => {
    switch (direction) {
      case 'positive':
        return {
          icon: TrendingUp,
          badgeClassName:
            'bg-green-500/10 text-green-700 border-green-500/30 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/40',
          iconClassName: 'text-green-600 dark:text-green-400',
        };
      case 'negative':
        return {
          icon: TrendingDown,
          badgeClassName:
            'bg-red-500/10 text-red-700 border-red-500/30 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/40',
          iconClassName: 'text-red-600 dark:text-red-400',
        };
      default:
        return {
          icon: Minus,
          badgeClassName: 'bg-muted text-muted-foreground border-border',
          iconClassName: 'text-muted-foreground',
        };
    }
  };

  const config = getDirectionConfig(change.direction);
  const Icon = config.icon;

  // Navigate to stock detail page (placeholder: /stock/[ticker])
  const stockUrl = `/stock/${change.company.ticker}`;

  const signalLabel = getSignalLabel(change);

  return (
    <Link href={stockUrl} className="block cursor-pointer transition-opacity hover:opacity-95">
      <Card className="h-full cursor-pointer border-border/50 transition-all duration-200 hover:border-primary/30 hover:shadow-md hover:shadow-black/5 dark:hover:shadow-black/20">
        <CardContent className="p-4">
          <div className="space-y-3">
            {/* Company Header */}
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <CompanyLogo
                  name={change.company.name}
                  ticker={change.company.ticker}
                  logoUrl={change.company.logo_url || null}
                  size={40}
                />
                <div className="min-w-0">
                  <h3 className="font-bold text-foreground tabular-nums tracking-tight">{change.company.ticker}</h3>
                  <p className="text-xs text-muted-foreground truncate">{change.company.name}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Icon className={cn('h-4 w-4', config.iconClassName)} />
                <Badge variant="outline" className={cn('text-xs', config.badgeClassName)}>
                  {signalLabel}
                </Badge>
              </div>
            </div>

            {/* Change Description */}
            <p className="text-sm leading-relaxed text-muted-foreground line-clamp-2">
              {change.description}
            </p>

            {/* Context Label */}
            <p className="text-xs text-muted-foreground/70">{change.context}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
