'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Clock, TrendingUp } from 'lucide-react';
import { useMultipleMarketStatus } from '@/hooks/use-market-status';
import { formatTimeUntil } from '@/lib/market/market-status';
import { cn } from '@/lib/utils';

interface MarketHoursCardProps {
  exchangeCodes: string[];
  className?: string;
}

export function MarketHoursCard({ exchangeCodes, className }: MarketHoursCardProps) {
  const { data: marketStatuses, isLoading } = useMultipleMarketStatus(exchangeCodes);

  if (isLoading) {
    return (
      <Card className={cn('border-border/50', className)}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Market Hours
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {exchangeCodes.map((code) => (
            <div key={code} className="flex items-center justify-between gap-4 py-2">
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!marketStatuses || Object.keys(marketStatuses).length === 0) {
    return null;
  }

  const statuses = Object.values(marketStatuses);

  return (
    <Card className={cn('border-border/50', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Market Hours
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {statuses.map((status) => {
          const timeUntil = status.isOpen
            ? status.timeUntilClose
            : status.timeUntilOpen;
          const countdown = timeUntil ? formatTimeUntil(timeUntil) : null;

          return (
            <div key={status.exchange.code} className="flex items-center justify-between gap-4 py-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-semibold text-foreground">{status.exchange.name}</span>
                  {status.isHoliday && (
                    <Badge variant="outline" className="text-xs">
                      Holiday
                    </Badge>
                  )}
                  {status.isEarlyClose && (
                    <Badge variant="outline" className="text-xs">
                      Early Close
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>
                    {status.exchange.open_time} - {status.exchange.close_time} ({status.exchange.timezone.split('/').pop() || status.exchange.timezone})
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 flex-shrink-0">
                <Badge
                  variant={status.isOpen ? 'default' : 'secondary'}
                  className={cn(
                    status.isOpen
                      ? 'bg-green-500/10 text-green-700 border-green-500/30 dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/40'
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {status.isOpen ? 'Open' : 'Closed'}
                </Badge>
                {countdown && (
                  <span className="text-xs text-muted-foreground font-mono">
                    {countdown}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
