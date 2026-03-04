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

  const marketContext = nyseStatus && !nyseStatus.isHoliday
    ? nyseStatus.isOpen
      ? `NYSE closes in ${formatTimeUntilShort(nyseStatus.timeUntilClose ?? 0)}`
      : `Markets open in ${formatTimeUntilShort(nyseStatus.timeUntilOpen ?? 0)}`
    : null;

  return (
    <div className="space-y-1">
      <p className="text-lg font-medium text-foreground">
        {greeting}, {displayName}
      </p>
      {marketContext && (
        <p className="text-sm text-muted-foreground font-mono">
          {marketContext}
        </p>
      )}
    </div>
  );
}
