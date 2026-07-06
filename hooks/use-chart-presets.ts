'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase/client';
import type { IndicatorInstance } from '@/lib/finance/indicators';
import type { AdvancedChartType, ChartRange } from '@/hooks/use-chart-prefs';

const STORAGE_KEY = 'chart-presets';
const SETTINGS_KEY = 'chart_presets';

/** A user-saved fullscreen-chart preset — the full view, not just indicators. */
export interface ChartPreset {
  id: string;
  name: string;
  range: ChartRange;
  chartType: AdvancedChartType;
  indicators: IndicatorInstance[];
  showVolume: boolean;
  showEvents: boolean;
}

function loadLocal(): ChartPreset[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as ChartPreset[]) : [];
  } catch {
    return [];
  }
}

function saveLocal(presets: ChartPreset[]) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(presets)); } catch { /* ignore */ }
}

/**
 * Named fullscreen-chart presets, persisted to localStorage and synced to
 * Supabase user.settings (debounced) — same pattern as useChartPrefs.
 */
export function useChartPresets() {
  const { user } = useAuth();
  const [local, setLocal] = useState<ChartPreset[]>(loadLocal);
  const [userEdited, setUserEdited] = useState(false);

  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const presets = useMemo<ChartPreset[]>(() => {
    if (userEdited) return local;
    const remote = (user?.settings as Record<string, unknown> | undefined)?.[SETTINGS_KEY];
    return Array.isArray(remote) ? (remote as ChartPreset[]) : local;
  }, [user?.settings, local, userEdited]);

  const persist = useCallback((next: ChartPreset[]) => {
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

  const savePreset = useCallback((preset: Omit<ChartPreset, 'id'>) => {
    persist([...presets, { ...preset, id: `preset-${Date.now()}` }]);
  }, [presets, persist]);

  const deletePreset = useCallback((id: string) => {
    persist(presets.filter((p) => p.id !== id));
  }, [presets, persist]);

  return { presets, savePreset, deletePreset };
}
