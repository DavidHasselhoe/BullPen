'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, Share } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trackEvent } from '@/lib/analytics/track';
import { useAuth } from '@/hooks/use-auth';
import { enablePushOnThisDevice, getPermission, isPushSupported, isStandalone, needsHomeScreenInstall, PushPermissionError } from '@/lib/push/client';

type Context = 'holding' | 'lesson' | 'alert' | 'home';
type Mode = 'hidden' | 'permission' | 'install' | 'done';

const QUIET_MS = 30 * 24 * 60 * 60 * 1000;
const keyFor = (context: Context) => `bp_push_prompt_${context}`;

function recentlyAsked(context: Context): boolean {
  try {
    const at = Number(window.localStorage.getItem(keyFor(context)));
    return at > 0 && Date.now() - at < QUIET_MS;
  } catch {
    return false;
  }
}

function markAsked(context: Context) {
  try { window.localStorage.setItem(keyFor(context), String(Date.now())); } catch { /* storage unavailable: the card may show again */ }
}

function platform(): string {
  return needsHomeScreenInstall() ? 'ios_safari' : isStandalone() ? 'installed' : 'browser';
}

async function decide(context: Context): Promise<Mode> {
  if (recentlyAsked(context)) return 'hidden';
  if (needsHomeScreenInstall()) return 'install';
  if (context === 'home' || !isPushSupported()) return 'hidden';
  const permission = getPermission();
  if (permission === 'denied') return 'hidden';
  if (permission === 'granted') {
    const reg = await navigator.serviceWorker.getRegistration('/sw.js');
    if (await reg?.pushManager.getSubscription()) return 'hidden';
  }
  return 'permission';
}

/** A quiet inline ask for phone alerts, shown right after the person did something that makes alerts worth having. */
export function PushPrompt({ context }: { context: Context }) {
  const { t } = useTranslation('navigation');
  const { isAuthenticated } = useAuth();
  const [mode, setMode] = useState<Mode>('hidden');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // Guests can't save a device, so they are never asked.
    if (!isAuthenticated) return;
    let live = true;
    decide(context)
      .catch((): Mode => 'hidden')
      .then((next) => {
        if (!live || next === 'hidden') return;
        trackEvent('push_prompt_shown', { context, platform: platform() });
        if (next === 'install') {
          // The steps are the whole ask, so showing them counts as the answer.
          markAsked(context);
          trackEvent('push_prompt_answered', { context, platform: platform(), result: 'install_shown' });
        }
        setMode(next);
      });
    return () => { live = false; };
  }, [context, isAuthenticated]);

  function close() {
    markAsked(context);
    // The install card already logged its one answer when it was shown.
    if (mode !== 'install') trackEvent('push_prompt_answered', { context, platform: platform(), result: 'dismissed' });
    setMode('hidden');
  }

  async function enable() {
    setBusy(true);
    setFailed(false);
    try {
      await enablePushOnThisDevice();
      markAsked(context);
      trackEvent('push_prompt_answered', { context, platform: platform(), result: 'granted' });
      setMode('done');
    } catch (e) {
      // Only a real answer to the browser prompt ends the ask; any other failure stays visible and retryable.
      if (e instanceof PushPermissionError) {
        markAsked(context);
        trackEvent('push_prompt_answered', { context, platform: platform(), result: getPermission() === 'denied' ? 'denied' : 'dismissed' });
        setMode('hidden');
      } else {
        console.error('[push] prompt enable:', e);
        setFailed(true);
      }
    } finally {
      setBusy(false);
    }
  }

  if (mode === 'hidden') return null;

  if (mode === 'done') {
    return (
      <p role="status" className="mt-4 rounded-xl border border-border/60 bg-card px-4 py-3 text-sm text-muted-foreground">
        {t('pushPromptDone')}
      </p>
    );
  }

  const install = mode === 'install';
  return (
    <section aria-label={t('pushPromptLabel')} className="mt-4 rounded-xl border border-border/60 bg-card px-4 py-3">
      <div className="flex items-start gap-3">
        {install ? <Share className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden /> : <Bell className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />}
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-medium text-foreground">{install ? t('pushPromptInstallTitle') : t(`pushPromptTitle_${context}`)}</p>
          <p className="text-xs leading-snug text-muted-foreground">
            {install ? t('pushPromptInstallSteps') : t('pushPromptBody')}
          </p>
          {install && <p className="text-xs leading-snug text-muted-foreground">{t('pushPromptSignInAgain')}</p>}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" className="min-h-11" onClick={() => close()} disabled={busy}>
          {install ? t('pushPromptGotIt') : t('pushPromptNotNow')}
        </Button>
        {!install && (
          <Button type="button" variant="outline" size="sm" className="min-h-11" onClick={enable} disabled={busy}>
            {t('pushPromptEnable')}
          </Button>
        )}
      </div>
      {failed && <p role="alert" className="mt-2 text-sm text-muted-foreground">{t('pushPromptError')}</p>}
    </section>
  );
}
