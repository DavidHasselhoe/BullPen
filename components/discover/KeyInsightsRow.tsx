'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Sparkles } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { cn } from '@/lib/utils';
import type { FundamentalChange } from '@/hooks/use-discover';

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
  return type ? (SIGNAL_TYPE_LABELS[type] || type.replace(/_/g, ' ')) : 'Signal';
}

function getSignalBadgeClass(direction: string): string {
  switch (direction) {
    case 'positive':
      return 'bg-green-500/10 text-green-700 border-green-500/30 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/40';
    case 'negative':
      return 'bg-red-500/10 text-red-700 border-red-500/30 dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/40';
    default:
      return 'bg-muted text-muted-foreground border-border';
  }
}

/** Truncate description to ~60 chars for key insight cards */
function truncateDescription(text: string, maxLen = 60): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen).trim() + '…';
}

interface KeyInsightsRowProps {
  changes: FundamentalChange[] | undefined;
  isLoading: boolean;
}

export function KeyInsightsRow({ changes, isLoading }: KeyInsightsRowProps) {
  if (isLoading) {
    return (
      <div className="w-full min-w-0 overflow-hidden">
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-28 min-w-[220px] max-w-[240px] rounded-xl shrink-0" />
          ))}
        </div>
      </div>
    );
  }

  const insights = (changes ?? []).slice(0, 4);
  if (insights.length === 0) return null;

  return (
    <div className="w-full min-w-0 overflow-hidden">
      <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 snap-x snap-mandatory">
        {insights.map((change) => (
          <Link
            key={`${change.type}-${change.company.id}-${change.trend?.id || change.signal?.id}`}
            href={`/stock/${change.company.ticker}`}
            className="shrink-0 snap-start"
          >
            <Card className="h-full min-w-[220px] max-w-[240px] border-border/50 transition-all duration-200 hover:border-primary/40 hover:shadow-md cursor-pointer group overflow-hidden">
              <CardContent className="p-3">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <CompanyLogo
                      name={change.company.name}
                      ticker={change.company.ticker}
                      logoUrl={change.company.logo_url ?? null}
                      size={28}
                      className="shrink-0 rounded overflow-hidden"
                    />
                    <span className="font-extrabold text-foreground tabular-nums text-sm truncate">
                      {change.company.ticker}
                    </span>
                  </div>
                  <Badge variant="outline" className={cn('text-[10px] shrink-0', getSignalBadgeClass(change.direction))}>
                    {getSignalLabel(change)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2 group-hover:text-foreground transition-colors">
                  {truncateDescription(change.description)}
                </p>
                {change.context && (
                  <p className="text-[10px] text-muted-foreground/70 mt-1 truncate">
                    Metric: {change.context}
                  </p>
                )}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
