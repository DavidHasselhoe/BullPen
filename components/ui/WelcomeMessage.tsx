'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { GREETING_KEY, TZ_COOKIE, greetingName, greetingForHour, type InitialWelcome } from '@/lib/dashboard/greeting';

const noopSubscribe = () => () => {};

/**
 * `initial` is the heading as the server resolved it (lib/dashboard/initial-welcome.ts),
 * so the page's largest text is in the first HTML rather than waiting for the
 * browser to load the profile. Hydration renders exactly that; the browser's
 * own clock and profile take over right after, and agree with it whenever the
 * timezone cookie was already set.
 */
export function WelcomeMessage({ initial }: { initial?: InitialWelcome | null }) {
  const { t } = useTranslation('discover');
  const { user, isAuthenticated, isLoading } = useAuth();
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

  const displayName = user ? greetingName(user) : initial!.name;
  const greeting = t(GREETING_KEY[hydrated ? greetingForHour(new Date().getHours()) : (initial?.greeting ?? 'back')]);

  return (
    <h1 className="text-2xl font-bold tracking-tight text-foreground">
      {greeting}, <span className="font-normal text-muted-foreground">{displayName}</span>
    </h1>
  );
}
