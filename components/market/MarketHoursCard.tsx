'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Clock, Pencil, Minus, Check } from 'lucide-react';
import { useMultipleMarketStatus } from '@/hooks/use-market-status';
import { formatTimeUntil, formatTimeUntilShort, convertTimeToLocal } from '@/lib/market/market-status';
import { getCountryName } from '@/lib/market/country-flags';
import { cn } from '@/lib/utils';
import { ExchangePicker } from './ExchangePicker';

interface MarketHoursCardProps {
  exchangeCodes: string[];
  className?: string;
  /** When true, shows a pencil → edit mode with add/remove controls. */
  editable?: boolean;
  /** Called with the updated list when the user adds or removes an exchange. */
  onExchangesChange?: (codes: string[]) => void;
}

export function MarketHoursCard({
  exchangeCodes,
  className,
  editable = false,
  onExchangesChange,
}: MarketHoursCardProps) {
  const { data: marketStatuses, isLoading } = useMultipleMarketStatus(exchangeCodes);
  const [isEditing, setIsEditing] = useState(false);

  // Group exchanges by country and pick one representative exchange per country.
  // Preserves the order of `exchangeCodes` so the user's chosen list ordering is
  // respected, falling back to country-name sort if `marketStatuses` skipped any.
  const countryGroups = useMemo(() => {
    if (!marketStatuses) return [];

    const countryMap = new Map<string, typeof marketStatuses[string]>();
    const orderByCountry = new Map<string, number>();

    // First pass — preserve the order the codes arrived in
    exchangeCodes.forEach((code, i) => {
      const status = marketStatuses[code] ?? marketStatuses[code?.toUpperCase()];
      if (!status) return;
      const cc = status.exchange.country;
      if (!countryMap.has(cc)) {
        countryMap.set(cc, status);
        orderByCountry.set(cc, i);
      }
    });

    // Second pass — catch any statuses keyed under symbols we didn't iterate
    Object.values(marketStatuses).forEach((status) => {
      const cc = status.exchange.country;
      if (!countryMap.has(cc)) {
        countryMap.set(cc, status);
        orderByCountry.set(cc, countryMap.size);
      }
    });

    return Array.from(countryMap.entries())
      .map(([countryCode, status]) => ({ countryCode, status }))
      .sort((a, b) =>
        (orderByCountry.get(a.countryCode) ?? 0) - (orderByCountry.get(b.countryCode) ?? 0)
      );
  }, [marketStatuses, exchangeCodes]);

  function handleRemove(codeToRemove: string) {
    if (!onExchangesChange) return;
    // Remove every code that maps to the same country as the removed code, so
    // the row disappears even if multiple sub-exchanges of one country were
    // saved (e.g. NYSE + NASDAQ both = US).
    const status = marketStatuses?.[codeToRemove];
    const targetCountry = status?.exchange.country;
    const next = exchangeCodes.filter((code) => {
      if (code === codeToRemove) return false;
      if (targetCountry) {
        const s = marketStatuses?.[code];
        if (s?.exchange.country === targetCountry) return false;
      }
      return true;
    });
    onExchangesChange(next);
  }

  function handleAdd(code: string) {
    if (!onExchangesChange) return;
    if (exchangeCodes.includes(code)) return;
    onExchangesChange([...exchangeCodes, code]);
  }

  const headerControls = editable ? (
    <button
      type="button"
      onClick={() => setIsEditing((v) => !v)}
      className={cn(
        'h-7 w-7 rounded-md flex items-center justify-center transition-colors shrink-0',
        isEditing
          ? 'text-emerald-500 hover:bg-emerald-500/10'
          : 'text-muted-foreground/55 hover:text-foreground hover:bg-muted/60'
      )}
      aria-label={isEditing ? 'Done editing' : 'Edit exchanges'}
      title={isEditing ? 'Done' : 'Edit exchanges'}
    >
      {isEditing ? <Check className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
    </button>
  ) : null;

  if (isLoading) {
    return (
      <Card className={cn('border-border/50 min-w-0 overflow-hidden', className)}>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-primary" />
              Market Hours
            </CardTitle>
            {headerControls}
          </div>
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
    // Edit mode: still render the card so the user can add their first exchange
    if (editable && isEditing) {
      return (
        <Card className={cn('border-border/50 min-w-0 overflow-hidden', className)}>
          <CardHeader>
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                Market Hours
              </CardTitle>
              {headerControls}
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground/60 mb-3">
              No exchanges yet — pick the markets you want to track.
            </p>
            <ExchangePicker selectedCodes={exchangeCodes} onAdd={handleAdd} />
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  return (
    <Card className={cn('border-border/50 min-w-0 overflow-hidden', className)}>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-primary" />
            Market Hours
          </CardTitle>
          {headerControls}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {countryGroups.map(({ countryCode, status }) => {
          const timeUntil = status.isOpen ? status.timeUntilClose : status.timeUntilOpen;
          const THIRTY_MIN_MS = 30 * 60 * 1000;
          const countdown = timeUntil
            ? timeUntil <= THIRTY_MIN_MS
              ? formatTimeUntil(timeUntil)
              : formatTimeUntilShort(timeUntil)
            : null;
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
                      unoptimized
                    />
                    <span className="font-semibold text-foreground text-sm">
                      {countryName} Exchange
                    </span>
                    {status.isHoliday && (
                      <Badge variant="outline" className="text-xs">Holiday</Badge>
                    )}
                    {status.isEarlyClose && (
                      <Badge variant="outline" className="text-xs">Early Close</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="font-mono">
                      {convertTimeToLocal(status.exchange.open_time, status.exchange.timezone)} – {convertTimeToLocal(status.exchange.close_time, status.exchange.timezone)}
                    </span>
                  </div>
                </div>
              </div>

              {isEditing && editable ? (
                <button
                  type="button"
                  onClick={() => handleRemove(status.exchange.code)}
                  className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground/60 hover:text-red-400 hover:bg-red-500/10 transition-colors shrink-0"
                  aria-label={`Remove ${countryName}`}
                  title={`Remove ${countryName}`}
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
              ) : (
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
                    <span className="text-xs text-muted-foreground font-mono">{countdown}</span>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Edit-mode adder appears below the list */}
        {isEditing && editable && (
          <div className="pt-1">
            <ExchangePicker selectedCodes={exchangeCodes} onAdd={handleAdd} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
