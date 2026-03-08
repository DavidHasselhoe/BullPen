'use client';

import { useEffect, useState } from 'react';
import { useMarketStatus } from '@/hooks/use-market-status';
import { formatTimeUntil } from '@/lib/market/market-status';
import { cn } from '@/lib/utils';
import { Clock } from 'lucide-react';

interface MarketCountdownProps {
  exchangeCode: string;
  className?: string;
  showLabel?: boolean;
}

export function MarketCountdown({ exchangeCode, showLabel = true, className }: MarketCountdownProps) {
  const { data: status, isLoading } = useMarketStatus(exchangeCode);
  const [countdown, setCountdown] = useState<string>('');

  useEffect(() => {
    if (!status) return;

    const updateCountdown = () => {
      const timeUntil = status.isOpen ? status.timeUntilClose : status.timeUntilOpen;
      if (timeUntil !== null) {
        setCountdown(formatTimeUntil(timeUntil));
      } else {
        setCountdown('');
      }
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 5000);

    return () => clearInterval(interval);
  }, [status]);

  if (isLoading || !status) {
    return (
      <div className={cn('flex items-center gap-2 text-sm text-muted-foreground', className)}>
        {showLabel && <Clock className="h-4 w-4" />}
        <span className="font-mono">--:--:--</span>
      </div>
    );
  }

  const timeUntil = status.isOpen ? status.timeUntilClose : status.timeUntilOpen;
  const label = status.isOpen ? 'Closes in' : 'Opens in';

  if (!timeUntil || timeUntil <= 0) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      {showLabel && (
        <>
          <Clock className="h-4 w-4 text-muted-foreground" />
          <span className="text-muted-foreground">{label}:</span>
        </>
      )}
      <span className="font-mono font-medium text-foreground">{countdown}</span>
    </div>
  );
}
