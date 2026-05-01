'use client';

import { useAuth } from '@/hooks/use-auth';
import { useMarketStatus } from '@/hooks/use-market-status';
import { formatTimeUntilShort } from '@/lib/market/market-status';

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

export function WelcomeMessage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { data: nyseStatus } = useMarketStatus('NYSE');

  if (isLoading || !isAuthenticated || !user) {
    return null;
  }

  const displayName = user.full_name || user.username || user.email?.split('@')[0] || 'User';
  const greeting = getTimeGreeting();
  const marketOpen = nyseStatus && !nyseStatus.isHoliday && nyseStatus.isOpen;

  const marketContext = nyseStatus && !nyseStatus.isHoliday
    ? nyseStatus.isOpen
      ? `NYSE closes in ${formatTimeUntilShort(nyseStatus.timeUntilClose ?? 0)}`
      : `Markets open in ${formatTimeUntilShort(nyseStatus.timeUntilOpen ?? 0)}`
    : null;

  return (
    <div className="flex items-baseline justify-between gap-4">
      <h1 className="text-2xl font-bold tracking-tight text-foreground">
        {greeting},{' '}
        <span className="text-muted-foreground font-normal">{displayName}</span>
      </h1>
      {marketContext && (
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`h-1.5 w-1.5 rounded-full shrink-0 ${
              marketOpen ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400/80'
            }`}
          />
          <span className="text-[11px] font-mono text-muted-foreground tracking-wide">
            {marketContext}
          </span>
        </div>
      )}
    </div>
  );
}
