'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
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
  const label = type ? SIGNAL_TYPE_LABELS[type] || type.replace(/_/g, ' ') : 'Signal';
  const sentiment = change.direction === 'positive' ? 'Positive' : change.direction === 'negative' ? 'Negative' : 'Neutral';
  return `${sentiment} • ${label}`;
}

/** Truncate description for card consistency */
function truncateDescription(text: string, maxLen = 80): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + '…';
}

interface FundamentalChangeCardProps {
  change: FundamentalChange;
}

export function FundamentalChangeCard({ change }: FundamentalChangeCardProps) {
  const getDirectionConfig = (direction: string) => {
    switch (direction) {
      case 'positive':
        return {
          badgeClassName:
            'bg-green-500/10 text-green-700 border-green-500/30 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/40',
        };
      case 'negative':
        return {
          badgeClassName:
            'bg-red-500/10 text-red-700 border-red-500/30 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/40',
        };
      default:
        return {
          badgeClassName: 'bg-muted text-muted-foreground border-border',
        };
    }
  };

  const config = getDirectionConfig(change.direction);

  // Navigate to stock detail page (placeholder: /stock/[ticker])
  const stockUrl = `/stock/${change.company.ticker}`;

  const signalLabel = getSignalLabel(change);

  return (
    <Link href={stockUrl} className="block cursor-pointer h-full min-w-0">
      <Card className="h-full cursor-pointer border-border/50 transition-all duration-200 hover:border-primary/40 hover:shadow-lg hover:shadow-black/10 dark:hover:shadow-black/25 hover:-translate-y-0.5 min-w-0 overflow-hidden">
        <CardContent className="p-4">
          <div className="space-y-2.5">
            {/* Header: Ticker + Signal badge */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <CompanyLogo
                  name={change.company.name}
                  ticker={change.company.ticker}
                  logoUrl={change.company.logo_url || null}
                  size={36}
                  className="shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="font-extrabold text-foreground tabular-nums tracking-tight truncate">{change.company.ticker}</h3>
                  <p className="text-xs text-muted-foreground truncate">{change.company.name}</p>
                </div>
              </div>
              <Badge variant="outline" className={cn('text-xs shrink-0', config.badgeClassName)}>
                {signalLabel}
              </Badge>
            </div>

            {/* Short description */}
            <p className="text-sm leading-relaxed text-muted-foreground line-clamp-2">
              {truncateDescription(change.description)}
            </p>

            {/* Metric affected */}
            {change.context && (
              <p className="text-xs text-muted-foreground/70">
                Metric: {change.context}
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
