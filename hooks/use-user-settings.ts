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
      const existing = ((user as any).settings as any) || {};
      const merged = { ...existing, market_context_mode: mode };
      await supabase.from('users').update({ settings: merged }).eq('id', user.id);
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
