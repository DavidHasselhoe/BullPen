'use client';

import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase/client';
import { useCallback } from 'react';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

interface UseExperienceLevelReturn {
  /** The user's current experience level. Defaults to 'intermediate' when not set. */
  level: ExperienceLevel;
  /** True when level is 'beginner' — components should show simplified labels and hide advanced controls. */
  isSimplified: boolean;
  /** Update experience level in DB and refresh auth context. */
  setLevel: (level: ExperienceLevel) => Promise<void>;
}

export function useExperienceLevel(): UseExperienceLevelReturn {
  const { user, refresh } = useAuth();

  const level: ExperienceLevel = user?.experience_level ?? 'intermediate';
  const isSimplified = level === 'beginner';

  const setLevel = useCallback(
    async (newLevel: ExperienceLevel) => {
      if (!user) return;
      const supabase = createBrowserClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const client = supabase as any;
      await client.from('users').update({ experience_level: newLevel }).eq('id', user.id);
      await refresh();
    },
    [user, refresh]
  );

  return { level, isSimplified, setLevel };
}
