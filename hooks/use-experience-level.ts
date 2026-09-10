'use client';

import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase/client';
import { useCallback } from 'react';

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced';

interface UseExperienceLevelReturn {
  /** The user's current experience level. Defaults to 'beginner' when not set. */
  level: ExperienceLevel;
  /** True when level is 'beginner' — components should show simplified labels and hide advanced controls. */
  isSimplified: boolean;
  /** Update experience level in DB and refresh auth context. */
  setLevel: (level: ExperienceLevel) => Promise<void>;
}

export function useExperienceLevel(): UseExperienceLevelReturn {
  const { user, refresh } = useAuth();

  // Beginner, not intermediate, for anyone who hasn't set a level. BullPen is
  // built for people who don't know where to start, so the fallback should say
  // that. In practice this reaches few people: the get-started quiz asks for a
  // level up front and writes it, so this only covers accounts created before
  // that quiz existed or that skipped it. Either way the Simple/Pro toggle
  // flips it in one click.
  const level: ExperienceLevel = user?.experience_level ?? 'beginner';
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
