'use client';

import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { useTrend } from '@/hooks/use-metrics';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { MetricType, PeriodType } from '@/lib/types/database';

interface TrendIndicatorProps {
  companyId: string | null;
  metricType: MetricType;
  periodType: PeriodType;
}

/**
 * Formats trend type for display (e.g., "sustained_growth" -> "Sustained Growth")
 */
function formatTrendType(trendType: string): string {
  return trendType
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Trend Indicator Component
 * Displays the strongest trend for the selected metric and period
 * Uses subtle fade/slide animations for state changes
 * Designed to be contextual and non-intrusive
 */
export function TrendIndicator({ companyId, metricType, periodType }: TrendIndicatorProps) {
  const { data: trend, isLoading } = useTrend(companyId, metricType, periodType);
  const [isVisible, setIsVisible] = useState(false);
  const [displayKey, setDisplayKey] = useState(0);

  // Handle animation when trend changes
  useEffect(() => {
    if (isLoading) {
      setIsVisible(false);
      return;
    }

    if (trend) {
      // Fade out previous, then fade in new
      setIsVisible(false);
      const timer = setTimeout(() => {
        setDisplayKey((prev) => prev + 1);
        setIsVisible(true);
      }, 200);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [trend?.id, metricType, periodType, isLoading]);

  // Don't render anything if no trend available
  if (isLoading || !trend) {
    return null;
  }

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

  const config = getDirectionConfig(trend.direction);
  const Icon = config.icon;

  return (
    <div
      key={displayKey}
      className={cn(
        'rounded-lg border border-border/50 bg-card/50 p-4 transition-all duration-300 ease-out',
        isVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 -translate-y-1'
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex items-center gap-2 flex-shrink-0 mt-0.5">
          <Icon
            className={cn('h-4 w-4 transition-colors duration-200', config.iconClassName)}
          />
          <Badge
            variant="outline"
            className={cn(
              'text-xs font-medium transition-colors duration-200',
              config.badgeClassName
            )}
          >
            {formatTrendType(trend.trend_type)}
          </Badge>
        </div>
        <p className="text-sm leading-relaxed text-muted-foreground flex-1">
          {trend.explanation}
        </p>
      </div>
    </div>
  );
}
