import { createBrowserClient } from '@/lib/supabase/client';
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
 * Never throws: this is setup, not the critical path.
 */
export async function flushPendingOnboardingData(userId: string): Promise<void> {
  const pending = readPendingOnboarding();
  if (!pending) return;

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
    if (error) return;

    // Sequential, not parallel: /api/watchlist lazily creates the user's first
    // list, and parallel first calls would race to create it twice.
    for (const pick of pending.picks) {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbol: pick.ticker, company_name: pick.name }),
      });
      if (!res.ok) return;
    }

    clearPendingOnboarding();
  } catch {
    // Network blip, RLS not ready yet. Leave the payload for the next retry.
  }
}
