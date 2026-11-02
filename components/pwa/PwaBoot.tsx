'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { trackEvent } from '@/lib/analytics/track';
import { isPushSupported, isStandalone } from '@/lib/push/client';
import { recordPushOpen, savePushSubscription } from '@/app/actions/push';
import { useAuth } from '@/components/auth/AuthProvider';

/** Registers the service worker, counts installs, and records opens that came from a push. */
export function PwaBoot() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const userId = useAuth().user?.id;

  // On sign-in, re-save this browser's push subscription for the signed-in user. An idempotent upsert on
  // endpoint: it moves a shared device to this user and saves an onboarding subscription whose post-signup save failed.
  useEffect(() => {
    if (!userId || !isPushSupported()) return;
    let live = true;
    navigator.serviceWorker.getRegistration('/sw.js')
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => {
        if (!live || !sub) return;
        return savePushSubscription(sub.toJSON(), Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.userAgent)
          .then((res) => { if (!res.success) console.error('[pwa] resave push subscription:', res.error); });
      })
      .catch((e) => console.error('[pwa] resave push subscription:', e));
    return () => { live = false; };
  }, [userId]);

  useEffect(() => {
    if (isPushSupported()) navigator.serviceWorker.register('/sw.js').catch((e) => console.error('[pwa] sw register:', e));
    if (!isStandalone()) return;
    try {
      if (localStorage.getItem('bp_pwa_installed')) return;
      localStorage.setItem('bp_pwa_installed', '1');
    } catch { /* storage blocked: skip the once-per-device guard */ }
    trackEvent('pwa_installed');
  }, []);

  const src = params.get('src');
  const n = params.get('n');
  useEffect(() => {
    if (src !== 'push' || !n) return;
    // Measurement, not a user action: a failure is logged and never shown.
    recordPushOpen(n).catch((e) => console.error('[pwa] record push open:', e));
    const next = new URLSearchParams(params.toString());
    next.delete('src');
    next.delete('n');
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [src, n, params, pathname, router]);

  return null;
}
