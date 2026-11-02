import { createBrowserClient } from '@/lib/supabase/client';
import { savePushSubscription } from '@/app/actions/push';
import {
  clearPendingOnboarding,
  experienceLevelFor,
  notificationOverrides,
  readPendingOnboarding,
} from './pending-onboarding';

/**
 * Writes the pre-signup onboarding choices now that the account exists.
 * Called from AuthProvider on every SIGNED_IN event (email and Google both
 * funnel through it), and again as a fallback retry from
 * PendingOnboardingFlush once `user` has loaded.
 *
 * Order matters for idempotency: the users row and watchlist writes are both
 * safe to repeat (update / upsert), and the pending payload is cleared only
 * after both succeed, so a partial failure retries the whole thing.
 *
 * Never throws: this is setup, not the critical path. Resolves false when
 * something failed (the payload stays for a retry), so the one caller a person
 * is waiting on, "Save and continue", can say so instead of moving on.
 */
// Both callers fire at sign-in, so without this one pick was POSTed four times.
let inFlight: Promise<boolean> | null = null;

export function flushPendingOnboardingData(userId: string): Promise<boolean> {
  inFlight ??= flush(userId).finally(() => { inFlight = null; });
  return inFlight;
}

async function flush(userId: string): Promise<boolean> {
  const pending = readPendingOnboarding();
  if (!pending) return true;

  try {
    const supabase = createBrowserClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usersTable = (supabase as any).from('users');

    // Fetch-merge-write settings so nothing already present is clobbered.
    const { data: existing } = await usersTable.select('settings').eq('id', userId).single();
    const settings = (existing?.settings as Record<string, unknown>) ?? {};
    const notifications = {
      ...((settings.notifications as Record<string, boolean>) ?? {}),
      ...notificationOverrides(pending.alerts),
    };

    const { error } = await usersTable
      .update({
        experience_level: experienceLevelFor(pending.style),
        settings: { ...settings, notifications },
      })
      .eq('id', userId);
    if (error) return false;

    // Sequential, not parallel: /api/watchlist lazily creates the user's first
    // list, and parallel first calls would race to create it twice.
    for (const pick of pending.picks) {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: pick.ticker, company_name: pick.name }),
      });
      if (!res.ok) return false;
    }

    // Onboarding matters more than push: a failed device save is logged, not retried by failing the flush.
    if (pending.pushSubscription) {
      try {
        const res = await savePushSubscription(pending.pushSubscription.sub, pending.pushSubscription.timeZone, navigator.userAgent);
        if (!res.success) console.error('[push] onboarding subscription not saved:', res.error);
      } catch (e) {
        console.error('[push] onboarding subscription not saved:', e);
      }
    }

    clearPendingOnboarding();
    return true;
  } catch {
    // Network blip, RLS not ready yet. Leave the payload for the next retry.
    return false;
  }
}
