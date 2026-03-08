'use client';

import { useMemo } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Clock } from 'lucide-react';
import { useMultipleMarketStatus } from '@/hooks/use-market-status';
import { formatTimeUntil, convertTimeToLocal } from '@/lib/market/market-status';
import { getCountryName } from '@/lib/market/country-flags';
import { cn } from '@/lib/utils';

interface MarketHoursCardProps {
  exchangeCodes: string[];
  className?: string;
}

export function MarketHoursCard({ exchangeCodes, className }: MarketHoursCardProps) {
  const { data: marketStatuses, isLoading } = useMultipleMarketStatus(exchangeCodes);

  // Group exchanges by country and pick one representative exchange per country
  const countryGroups = useMemo(() => {
    if (!marketStatuses) return [];

    const countryMap = new Map<string, typeof marketStatuses[string]>();
    
    // Group by country, picking the first exchange for each country
    Object.values(marketStatuses).forEach((status) => {
      const countryCode = status.exchange.country;
      if (!countryMap.has(countryCode)) {
        countryMap.set(countryCode, status);
      }
    });

    // Convert to array and sort by country name
    return Array.from(countryMap.entries())
      .map(([countryCode, status]) => ({
        countryCode,
        status,
      }))
      .sort((a, b) => getCountryName(a.countryCode).localeCompare(getCountryName(b.countryCode)));
  }, [marketStatuses]);

  if (isLoading) {
    return (
      <Card className={cn('border-border/50 min-w-0 overflow-hidden', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Market Hours
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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

  if (!marketStatuses || countryGroups.length === 0) {
    return null;
  }

  return (
    <Card className={cn('border-border/50 min-w-0 overflow-hidden', className)}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Clock className="h-5 w-5 text-primary" />
          Market Hours
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {countryGroups.map(({ countryCode, status }) => {
          // When market is open, show countdown to close. When closed, show countdown to open
          const timeUntil = status.isOpen
            ? status.timeUntilClose
            : status.timeUntilOpen;
          const countdown = timeUntil ? formatTimeUntil(timeUntil) : null;
          const countryName = getCountryName(countryCode);
          const flagUrl = `https://flagcdn.com/w20/${countryCode.toLowerCase()}.png`;

          return (
            <div key={countryCode} className="flex items-center justify-between gap-4 py-2.5">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span
                  className={cn(
                    'h-2 w-2 shrink-0 rounded-full',
                    status.isOpen ? 'bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.6)]' : 'bg-red-500/80'
                  )}
                  aria-label={status.isOpen ? 'Open' : 'Closed'}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Image
                      src={flagUrl}
                      alt={`${countryName} flag`}
                      width={20}
                      height={15}
                      className="rounded-sm object-cover"
                      style={{ width: '20px', height: '15px' }}
                    />
                    <span className="font-semibold text-foreground text-sm">
                      {countryName} Exchange
                    </span>
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
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">
                      {convertTimeToLocal(status.exchange.open_time, status.exchange.timezone)} – {convertTimeToLocal(status.exchange.close_time, status.exchange.timezone)}
                    </span>
                  </div>
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
