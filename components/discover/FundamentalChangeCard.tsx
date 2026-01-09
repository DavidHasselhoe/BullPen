'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FundamentalChange } from '@/hooks/use-discover';

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

  return (
    <Link href={stockUrl} className="block transition-opacity hover:opacity-80">
      <Card className="h-full border-border/50 transition-all duration-200 hover:border-border hover:shadow-sm">
        <CardContent className="p-4">
          <div className="space-y-3">
            {/* Company Header */}
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-foreground">{change.company.name}</h3>
                <p className="text-sm text-muted-foreground">{change.company.ticker}</p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <Icon className={cn('h-4 w-4', config.iconClassName)} />
                <Badge variant="outline" className={cn('text-xs', config.badgeClassName)}>
                  {change.direction === 'positive' ? 'Positive' : change.direction === 'negative' ? 'Negative' : 'Neutral'}
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
