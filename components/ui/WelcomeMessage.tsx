'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useMarketStatus } from '@/hooks/use-market-status';
import { formatTimeUntilShort } from '@/lib/market/market-status';
import { GREETING_TEXT, TZ_COOKIE, greetingForHour, type InitialWelcome } from '@/lib/dashboard/greeting';

const noopSubscribe = () => () => {};

/**
 * `initial` is the heading as the server resolved it (lib/dashboard/initial-welcome.ts),
 * so the page's largest text is in the first HTML rather than waiting for the
 * browser to load the profile. Hydration renders exactly that; the browser's
 * own clock and profile take over right after, and agree with it whenever the
 * timezone cookie was already set.
 */
export function WelcomeMessage({ initial }: { initial?: InitialWelcome | null }) {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { data: nyseStatus } = useMarketStatus('NYSE');
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);

  // Tell the server the viewer's timezone for the next render. A DOM side
  // effect, not state. A year is plenty; it is rewritten on every visit anyway.
  useEffect(() => {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      document.cookie = `${TZ_COOKIE}=${encodeURIComponent(tz)}; path=/; max-age=31536000; samesite=lax`;
    } catch { /* no Intl zone support */ }
  }, []);

  const signedIn = !isLoading && isAuthenticated && !!user;
  if (!signedIn && !(isLoading && initial)) {
    return null;
  }

  const displayName = user
    ? user.full_name || user.username || user.email?.split('@')[0] || 'User'
    : initial!.name;
  const greeting = GREETING_TEXT[hydrated ? greetingForHour(new Date().getHours()) : (initial?.greeting ?? 'back')];
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
