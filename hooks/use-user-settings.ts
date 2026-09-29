'use client';

import { useCallback } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { createBrowserClient } from '@/lib/supabase/client';
import { DEFAULT_ORDER as DEFAULT_WIDGET_ORDER } from '@/lib/dashboard/widgets';
import type { CurrencyCode } from '@/lib/currency/currency-conversion';

/** Uninvested cash the user entered on My Holdings, in the currency they entered it in. */
export interface CashBalance {
  amount: number;
  currency: CurrencyCode;
}

export function useUserSettings() {
  const { user } = useAuth();

  const settings = (user?.settings as Record<string, unknown>) ?? {};

  // Default to true if not set
  const showWelcomeText =
    settings.show_welcome_text !== undefined ? settings.show_welcome_text : true;

  // round_numbers: show whole numbers (no decimals) where it makes sense - default false
  const roundNumbers = settings.round_numbers === true;

  // Homepage layout customization
  const homepageWidgetOrder: string[] = Array.isArray(settings.homepage_widget_order)
    ? settings.homepage_widget_order
    : DEFAULT_WIDGET_ORDER;
  const homepageWidgetHidden: string[] = Array.isArray(settings.homepage_widget_hidden)
    ? settings.homepage_widget_hidden
    : [];

  // Tickers the user has pinned for quick access. Raw symbols (e.g. "AAPL",
  // "BTC/USD"), same convention as watchlist — not URL slugs.
  const pinnedTickers: string[] = Array.isArray(settings.pinned_tickers)
    ? (settings.pinned_tickers as string[])
    : [];

  const rawCash = settings.cash_balance as Partial<CashBalance> | null | undefined;
  const cashBalance: CashBalance | null =
    // A 0 balance is still a tracked balance (all cash spent), so it keeps its row.
    rawCash && typeof rawCash.amount === 'number' && rawCash.amount >= 0 && rawCash.currency
      ? { amount: rawCash.amount, currency: rawCash.currency }
      : null;

  /** Pass null to clear the balance. Throws so the dialog can show the failure. */
  const updateCashBalance = useCallback(
    async (cash: CashBalance | null) => {
      if (!user?.id) return;
      const supabase = createBrowserClient();
      const { data: row, error: fetchError } = await supabase
        .from('users')
        .select('settings')
        .eq('id', user.id)
        .single();
      if (fetchError) throw fetchError;
      const existing = (row?.settings as Record<string, unknown>) || {};
      const merged = { ...existing, cash_balance: cash };
      const { error: updateError } = await supabase
        .from('users')
        .update({ settings: merged })
        .eq('id', user.id);
      if (updateError) throw updateError;
      window.dispatchEvent(new Event('auth:refresh'));
    },
    [user]
  );

  /**
   * Moves the tracked balance by `delta` (in the balance's own currency), never
   * below 0. Reads the balance from the DB, not memory, so two quick trades
   * can't both start from the same stale amount. No-op when cash isn't tracked.
   */
  const adjustCashBalance = useCallback(
    async (delta: number) => {
      if (!user?.id) return;
      const supabase = createBrowserClient();
      const { data: row, error: fetchError } = await supabase
        .from('users')
        .select('settings')
        .eq('id', user.id)
        .single();
      if (fetchError) throw fetchError;
      const existing = (row?.settings as Record<string, unknown>) || {};
      const current = existing.cash_balance as CashBalance | null | undefined;
      if (!current || typeof current.amount !== 'number') return;
      const amount = Math.max(0, Math.round((current.amount + delta) * 100) / 100);
      const merged = { ...existing, cash_balance: { ...current, amount } };
      const { error: updateError } = await supabase
        .from('users')
        .update({ settings: merged })
        .eq('id', user.id);
      if (updateError) throw updateError;
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

  return {
    showWelcomeText,
    roundNumbers,
    homepageWidgetOrder,
    homepageWidgetHidden,
    pinnedTickers,
    updatePinnedTickers,
    cashBalance,
    updateCashBalance,
    adjustCashBalance,
  };
}
