'use client';

import { useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase/client';

export type MarketContextMode = 'all' | 'holdings';

export function useUserSettings() {
  const { user } = useAuth();

  const settings = (user?.settings as any) || {};

  // Default to true if not set
  const showQuotes = settings.show_quotes !== undefined ? settings.show_quotes : true;
  const showWelcomeText =
    settings.show_welcome_text !== undefined ? settings.show_welcome_text : true;

  // round_numbers: show whole numbers (no decimals) where it makes sense - default false
  const roundNumbers = settings.round_numbers === true;

  // market_context_mode: 'all' | 'holdings' — default 'all'
  const marketContextMode: MarketContextMode =
    settings.market_context_mode === 'holdings' ? 'holdings' : 'all';

  const updateMarketContextMode = useCallback(
    async (mode: MarketContextMode) => {
      if (!user?.id) return;
      const supabase = createBrowserClient();
      // Always read latest settings from DB — merging in-memory `user.settings` would use a stale
      // snapshot whenever this callback was created with useCallback([user?.id]) only, overwriting
      // theme and other prefs saved after mount (e.g. Discover market context toggle).
      const { data: row, error: fetchError } = await supabase
        .from('users')
        .select('settings')
        .eq('id', user.id)
        .single();
      if (fetchError) return;
      const existing = (row?.settings as Record<string, unknown>) || {};
      const merged = { ...existing, market_context_mode: mode };
      const { error: updateError } = await supabase
        .from('users')
        .update({ settings: merged })
        .eq('id', user.id);
      if (updateError) return;
      window.dispatchEvent(new Event('auth:refresh'));
    },
    [user?.id]
  );

  return {
    showQuotes,
    showWelcomeText,
    roundNumbers,
    marketContextMode,
    updateMarketContextMode,
  };
}
