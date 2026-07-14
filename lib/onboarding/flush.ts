import { createBrowserClient } from '@/lib/supabase/client';
import { clearPendingQuizAnswers, readPendingQuizAnswers } from './pending-onboarding';

/**
 * Writes any pending pre-signup quiz answers into the now-existing
 * public.users row. Called from AuthProvider on every SIGNED_IN event (both
 * email and Google OAuth funnel through the same event there), and again as
 * a fallback retry from PendingOnboardingFlush once `user` has loaded.
 *
 * Never throws — this is enrichment data, not critical path. A failed write
 * just leaves the pending payload in localStorage for the next retry (or
 * lets it expire via the TTL in pending-onboarding.ts).
 */
export async function flushPendingOnboardingData(userId: string): Promise<void> {
  const pending = readPendingQuizAnswers();
  if (!pending) return;

  try {
    const supabase = createBrowserClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usersTable = (supabase as any).from('users');

    // Fetch-merge-write settings (same pattern as SettingsModal.tsx) so we
    // never clobber anything already present, e.g. from processOAuthProfile.
    const { data: existing } = await usersTable.select('settings').eq('id', userId).single();
    const mergedSettings = {
      ...((existing?.settings as Record<string, unknown>) ?? {}),
      investment_horizon: pending.investment_horizon,
      investing_goal: pending.investing_goal,
    };

    const { error } = await usersTable
      .update({
        experience_level: pending.experience_level,
        risk_profile: pending.risk_profile,
        settings: mergedSettings,
      })
      .eq('id', userId);

    if (!error) clearPendingQuizAnswers();
  } catch {
    // Network blip, RLS not ready yet, etc. — leave the pending payload for
    // the next retry rather than surfacing an error to the user.
  }
}
