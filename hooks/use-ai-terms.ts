'use client';

import { useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase/client';

/**
 * Bump this whenever the AI terms copy changes materially (new provider, new
 * retention policy, etc.) — existing users are re-prompted since their stored
 * acceptance won't match the new version.
 */
// 2026-10-08: the disclosure named OpenAI as processor; Bull runs on
// Anthropic's Claude. Bumped so everyone sees and accepts the corrected text.
export const AI_TERMS_VERSION = '2026-10-08';

interface UseAiTermsReturn {
  /** True once the user has accepted the *current* version of the AI terms. */
  hasAccepted: boolean;
  /** Records acceptance of the current version and refreshes the auth context. */
  accept: () => Promise<void>;
}

export function useAiTerms(): UseAiTermsReturn {
  const { user, refresh } = useAuth();

  const acceptedVersion = (user?.settings as Record<string, unknown> | null)?.ai_terms_accepted_version;
  const hasAccepted = acceptedVersion === AI_TERMS_VERSION;

  const accept = useCallback(async () => {
    if (!user) return;
    const supabase = createBrowserClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = supabase as any;
    const nextSettings = { ...(user.settings ?? {}), ai_terms_accepted_version: AI_TERMS_VERSION };
    await client.from('users').update({ settings: nextSettings }).eq('id', user.id);
    await refresh();
  }, [user, refresh]);

  return { hasAccepted, accept };
}
