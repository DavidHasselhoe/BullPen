'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase/client';
import type { Holding } from '@/app/tools/dividend/DividendClientPage';

const STORAGE_KEY = 'dividend-presets';
const SETTINGS_KEY = 'dividend_presets';

/** A user-saved dividend-calculator portfolio preset. */
export interface DividendPreset {
  id: string;
  name: string;
  holdings: Holding[];
}

function loadLocal(): DividendPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as DividendPreset[]) : [];
  } catch {
    return [];
  }
}

function saveLocal(presets: DividendPreset[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(presets)); } catch { /* ignore */ }
}

/**
 * Named dividend-calculator portfolio presets, persisted to localStorage and
 * synced to Supabase user.settings (debounced) — same pattern as useChartPresets.
 */
export function useDividendPresets() {
  const { user } = useAuth();
  const [local, setLocal] = useState<DividendPreset[]>(loadLocal);
  const [userEdited, setUserEdited] = useState(false);

  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const presets = useMemo<DividendPreset[]>(() => {
    if (userEdited) return local;
    const remote = (user?.settings as Record<string, unknown> | undefined)?.[SETTINGS_KEY];
    return Array.isArray(remote) ? (remote as DividendPreset[]) : local;
  }, [user?.settings, local, userEdited]);

  const persist = useCallback((next: DividendPreset[]) => {
    setUserEdited(true);
    setLocal(next);
    saveLocal(next);
    const currentUser = userRef.current;
    if (!currentUser) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      try {
        const supabase = createBrowserClient();
        const merged = { ...(currentUser.settings ?? {}), [SETTINGS_KEY]: next };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('users').update({ settings: merged }).eq('id', currentUser.id);
      } catch { /* non-critical */ }
    }, 1_000);
  }, []);

  const savePreset = useCallback((name: string, holdings: Holding[]) => {
    persist([...presets, { id: `dpreset-${Date.now()}`, name, holdings }]);
  }, [presets, persist]);

  const deletePreset = useCallback((id: string) => {
    persist(presets.filter((p) => p.id !== id));
  }, [presets, persist]);

  return { presets, savePreset, deletePreset };
}
