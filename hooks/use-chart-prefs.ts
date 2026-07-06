'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase/client';
import type { IndicatorInstance } from '@/lib/finance/indicators';

const STORAGE_KEY = 'chart-prefs';
const SETTINGS_KEY = 'chart_prefs';

export type ChartRange = '1D' | '1W' | '1M' | '6M' | '1Y' | 'YTD' | '5Y' | 'MAX';
export type ChartIndicator = 'sma50' | 'sma200' | 'ema20' | 'bbands' | 'rsi' | 'macd';
export type AdvancedChartType = 'candles' | 'line' | 'area';

export interface ChartPrefs {
  defaultRange: ChartRange;
  defaultIndicators: ChartIndicator[];
  showVolume: boolean;
  showEarnings: boolean;
  showPrevClose: boolean;
  showExtendedHours: boolean;
  chartStyle: 'area' | 'line';
  priceScale: 'linear' | 'log';
  // Advanced (fullscreen) chart — persisted so the experience is sticky.
  advancedChartType: AdvancedChartType;
  advancedIndicators: IndicatorInstance[];
}

export const CHART_PREF_DEFAULTS: ChartPrefs = {
  defaultRange: '1D',
  defaultIndicators: [],
  showVolume: false,
  showEarnings: false,
  showPrevClose: false,
  showExtendedHours: true,
  chartStyle: 'area',
  priceScale: 'linear',
  advancedChartType: 'candles',
  advancedIndicators: [],
};

function loadLocal(): ChartPrefs {
  if (typeof window === 'undefined') return CHART_PREF_DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return CHART_PREF_DEFAULTS;
    return { ...CHART_PREF_DEFAULTS, ...(JSON.parse(raw) as Partial<ChartPrefs>) };
  } catch {
    return CHART_PREF_DEFAULTS;
  }
}

function saveLocal(prefs: ChartPrefs) {
  if (typeof window === 'undefined') return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

export interface UseChartPrefs {
  prefs: ChartPrefs;
  setPref: <K extends keyof ChartPrefs>(key: K, val: ChartPrefs[K]) => void;
  /** Set several prefs atomically (avoids stale-closure clobbering when applying a preset). */
  setPrefs: (partial: Partial<ChartPrefs>) => void;
  reset: () => void;
}

export function useChartPrefs(): UseChartPrefs {
  const { user } = useAuth();
  const [localPrefs, setLocalPrefs] = useState<ChartPrefs>(loadLocal);
  const [userEdited, setUserEdited] = useState(false);

  const userRef = useRef(user);
  useEffect(() => { userRef.current = user; }, [user]);

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const prefs = useMemo<ChartPrefs>(() => {
    if (userEdited) return localPrefs;
    if (!user?.settings) return localPrefs;
    const remote = user.settings[SETTINGS_KEY] as Partial<ChartPrefs> | undefined;
    if (remote && typeof remote === 'object') return { ...CHART_PREF_DEFAULTS, ...remote };
    return localPrefs;
  }, [user?.settings, localPrefs, userEdited]);

  const saveToSupabase = useCallback((next: ChartPrefs) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const currentUser = userRef.current;
      if (!currentUser) return;
      try {
        const supabase = createBrowserClient();
        const merged = { ...(currentUser.settings ?? {}), [SETTINGS_KEY]: next };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase as any).from('users').update({ settings: merged }).eq('id', currentUser.id);
      } catch { /* non-critical */ }
    }, 1_000);
  }, []);

  const update = useCallback((next: ChartPrefs) => {
    setUserEdited(true);
    setLocalPrefs(next);
    saveLocal(next);
    if (userRef.current) saveToSupabase(next);
  }, [saveToSupabase]);

  const setPref = useCallback(<K extends keyof ChartPrefs>(key: K, val: ChartPrefs[K]) => {
    update({ ...prefs, [key]: val });
  }, [prefs, update]);

  const setPrefs = useCallback((partial: Partial<ChartPrefs>) => {
    update({ ...prefs, ...partial });
  }, [prefs, update]);

  const reset = useCallback(() => {
    setUserEdited(false);
    setLocalPrefs(CHART_PREF_DEFAULTS);
    saveLocal(CHART_PREF_DEFAULTS);
    if (userRef.current) saveToSupabase(CHART_PREF_DEFAULTS);
    if (typeof window !== 'undefined') {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    }
  }, [saveToSupabase]);

  return { prefs, setPref, setPrefs, reset };
}
