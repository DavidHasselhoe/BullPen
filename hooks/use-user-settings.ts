'use client';

import { useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase/client';
import { DEFAULT_ORDER as DEFAULT_WIDGET_ORDER } from '@/lib/dashboard/widgets';

export type MarketContextMode = 'all' | 'holdings';

/** Tool ids shown in the home "Tools shortcut" card before the user customises it. */
export const DEFAULT_TOOL_SHORTCUTS = ['screener', 'alerts', 'compare'];

export function useUserSettings() {
  const { user } = useAuth();

  const settings = (user?.settings as Record<string, unknown>) ?? {};

  // Default to true if not set
  const showQuotes = settings.show_quotes !== undefined ? settings.show_quotes : true;
  const showWelcomeText =
    settings.show_welcome_text !== undefined ? settings.show_welcome_text : true;

  // round_numbers: show whole numbers (no decimals) where it makes sense - default false
  const roundNumbers = settings.round_numbers === true;

  // market_context_mode: 'all' | 'holdings' — default 'all'
  const marketContextMode: MarketContextMode =
    settings.market_context_mode === 'holdings' ? 'holdings' : 'all';

  // Homepage layout customization
  const homepageWidgetOrder: string[] = Array.isArray(settings.homepage_widget_order)
    ? settings.homepage_widget_order
    : DEFAULT_WIDGET_ORDER;
  const homepageWidgetHidden: string[] = Array.isArray(settings.homepage_widget_hidden)
    ? settings.homepage_widget_hidden
    : [];

  // User-picked list of exchanges to show in the Market Hours widget when in
  // "all markets" mode. Holdings mode derives exchanges from the portfolio.
  const marketHoursExchanges: string[] | null = Array.isArray(settings.market_hours_exchanges)
    ? (settings.market_hours_exchanges as string[])
    : null;

  // Ids of Market Context sub-cards (market_hours, tools_shortcuts, top_movers,
  // market_news) the user has individually hidden — visibility only, no order.
  const marketContextHidden: string[] = Array.isArray(settings.market_context_hidden)
    ? (settings.market_context_hidden as string[])
    : [];

  // User-picked one-click tool shortcuts shown on the home page. Defaults to a
  // useful starter set; an explicit empty array means the user removed them all.
  const toolsShortcuts: string[] = Array.isArray(settings.tools_shortcuts)
    ? (settings.tools_shortcuts as string[])
    : DEFAULT_TOOL_SHORTCUTS;

  // Tickers the user has pinned for quick access. Raw symbols (e.g. "AAPL",
  // "BTC/USD"), same convention as watchlist — not URL slugs.
  const pinnedTickers: string[] = Array.isArray(settings.pinned_tickers)
    ? (settings.pinned_tickers as string[])
    : [];

  const updateToolsShortcuts = useCallback(
    async (ids: string[]) => {
      if (!user?.id) return;
      const supabase = createBrowserClient();
      const { data: row, error: fetchError } = await supabase
        .from('users')
        .select('settings')
        .eq('id', user.id)
        .single();
      if (fetchError) return;
      const existing = (row?.settings as Record<string, unknown>) || {};
      const merged = { ...existing, tools_shortcuts: ids };
      const { error: updateError } = await supabase
        .from('users')
        .update({ settings: merged })
        .eq('id', user.id);
      if (updateError) return;
      window.dispatchEvent(new Event('auth:refresh'));
    },
    [user]
  );

  const updateMarketHoursExchanges = useCallback(
    async (codes: string[]) => {
      if (!user?.id) return;
      const supabase = createBrowserClient();
      const { data: row, error: fetchError } = await supabase
        .from('users')
        .select('settings')
        .eq('id', user.id)
        .single();
      if (fetchError) return;
      const existing = (row?.settings as Record<string, unknown>) || {};
      const merged = { ...existing, market_hours_exchanges: codes };
      const { error: updateError } = await supabase
        .from('users')
        .update({ settings: merged })
        .eq('id', user.id);
      if (updateError) return;
      window.dispatchEvent(new Event('auth:refresh'));
    },
    [user]
  );

  const updatePinnedTickers = useCallback(
    async (symbols: string[]) => {
      if (!user?.id) return;
      const supabase = createBrowserClient();
      const { data: row, error: fetchError } = await supabase
        .from('users')
        .select('settings')
        .eq('id', user.id)
        .single();
      if (fetchError) return;
      const existing = (row?.settings as Record<string, unknown>) || {};
      const merged = { ...existing, pinned_tickers: symbols };
      const { error: updateError } = await supabase
        .from('users')
        .update({ settings: merged })
        .eq('id', user.id);
      if (updateError) return;
      window.dispatchEvent(new Event('auth:refresh'));
    },
    [user]
  );

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
    [user]
  );

  return {
    showQuotes,
    showWelcomeText,
    roundNumbers,
    marketContextMode,
    updateMarketContextMode,
    homepageWidgetOrder,
    homepageWidgetHidden,
    marketHoursExchanges,
    updateMarketHoursExchanges,
    marketContextHidden,
    toolsShortcuts,
    updateToolsShortcuts,
    pinnedTickers,
    updatePinnedTickers,
  };
}
