'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { getPermission, needsHomeScreenInstall, subscribeThisDevice, unsubscribeThisDevice } from '@/lib/push/client';
import { deletePushSubscription, savePushSubscription } from '@/app/actions/push';

/** "Notifications on this device": the browser permission and subscription, separate from the per-kind toggles. */
export function PushDeviceRow() {
  const { t } = useTranslation('settings');
  const [permission, setPermission] = useState(getPermission);
  const [subscribed, setSubscribed] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (permission === 'unsupported') return;
    let live = true;
    navigator.serviceWorker.getRegistration('/sw.js')
      .then((reg) => reg?.pushManager.getSubscription())
      .then((sub) => { if (live) setSubscribed(!!sub); })
      .catch(() => { if (live) setSubscribed(false); });
    return () => { live = false; };
  }, [permission]);

  async function toggle() {
    setBusy(true);
    setFailed(false);
    try {
      if (subscribed) {
        const endpoint = await unsubscribeThisDevice();
        if (endpoint) {
          const res = await deletePushSubscription(endpoint);
          if (!res.success) throw new Error('delete failed');
        }
        setSubscribed(false);
      } else {
        const sub = await subscribeThisDevice();
        const res = await savePushSubscription(sub, Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.userAgent);
        if (!res.success) throw new Error(res.error ?? 'save failed');
        setSubscribed(true);
      }
    } catch (e) {
      console.error('[push] toggle device:', e);
      setFailed(true);
    } finally {
      setPermission(getPermission());
      setBusy(false);
    }
  }

  const hint = permission === 'denied'
    ? t('pushDeviceBlocked')
    : permission === 'unsupported' && needsHomeScreenInstall()
      ? t('pushDeviceInstallHint')
      : null;
  if (permission === 'unsupported' && !hint) return null;

  return (
    <div className="py-3">
      <div className="flex min-h-11 items-center justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-0.5">
          <p className="text-sm font-medium text-foreground">{t('pushDeviceLabel')}</p>
          <p className="text-xs leading-snug text-muted-foreground">{hint ?? (subscribed ? t('pushDeviceOn') : t('pushDeviceDescription'))}</p>
        </div>
        {!hint && subscribed !== null && (
          <Button type="button" variant="outline" size="sm" onClick={toggle} disabled={busy} className="min-h-11 shrink-0">
            {subscribed ? t('pushDeviceDisable') : t('pushDeviceEnable')}
          </Button>
        )}
      </div>
      {failed && <p role="alert" className="mt-2 text-sm text-destructive">{t('pushDeviceError')}</p>}
    </div>
  );
}
