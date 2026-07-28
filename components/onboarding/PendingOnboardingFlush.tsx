'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { useAddOrUpdateHolding, useHoldings } from '@/hooks/use-holdings';
import { createBrowserClient } from '@/lib/supabase/client';
import { flushPendingOnboardingData } from '@/lib/onboarding/flush';
import { readPendingQuizAnswers } from '@/lib/onboarding/pending-onboarding';

/**
 * Replaces the old 3-step OnboardingModal. Two independent jobs:
 *  1. Silent fallback retry of the pre-signup quiz flush — AuthProvider
 *     already does this on SIGNED_IN, this just catches the rare case where
 *     that ran before `user` settled into state, or failed outright.
 *  2. A single, dismissable (not blocking) starter-ticker prompt — shown
 *     once per account, never gates app usage the way the old modal did.
 *     Only makes sense on the dashboard (the "start here" surface) and only
 *     for accounts that don't already hold anything — an existing holder
 *     doesn't need a starter-ticker nudge.
 */

const STARTER_STOCKS: { ticker: string; name: string }[] = [
  { ticker: 'NVDA', name: 'NVIDIA' },
  { ticker: 'MSFT', name: 'Microsoft' },
  { ticker: 'META', name: 'Meta' },
  { ticker: 'AAPL', name: 'Apple' },
  { ticker: 'AMZN', name: 'Amazon' },
  { ticker: 'TSLA', name: 'Tesla' },
  { ticker: 'NBIS', name: 'Nebius' },
  { ticker: 'MU', name: 'Micron' },
  { ticker: 'JNJ', name: 'Johnson & Johnson' },
];

export function PendingOnboardingFlush() {
  const { user, isLoading, refresh } = useAuth();
  const addHolding = useAddOrUpdateHolding();
  const router = useRouter();
  const pathname = usePathname();
  const { data: holdings, isLoading: holdingsLoading } = useHoldings();

  const [dismissed, setDismissed] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  // Fallback retry — harmless if AuthProvider's flush already succeeded,
  // since both are gated on the same "is there pending data" check.
  useEffect(() => {
    if (isLoading || !user) return;
    if (!readPendingQuizAnswers()) return;
    void flushPendingOnboardingData(user.id).then(() => refresh());
  }, [isLoading, user, refresh]);

  const promptShown = (user?.settings as Record<string, unknown> | null)?.starter_tickers_prompted === true;
  const isDashboard = pathname === '/dashboard';
  const hasHoldings = (holdings?.length ?? 0) > 0;
  const isOpen =
    isDashboard && !isLoading && !!user && !promptShown && !dismissed && !holdingsLoading && !hasHoldings;

  const markPrompted = useCallback(async () => {
    if (!user) return;
    const supabase = createBrowserClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const usersTable = (supabase as any).from('users');
    const { data: existing } = await usersTable.select('settings').eq('id', user.id).single();
    const mergedSettings = { ...((existing?.settings as Record<string, unknown>) ?? {}), starter_tickers_prompted: true };
    await usersTable.update({ settings: mergedSettings }).eq('id', user.id);
  }, [user]);

  const toggleStock = useCallback((ticker: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  }, []);

  const dismiss = useCallback(
    async (addSelected: boolean) => {
      setSaving(true);
      try {
        let added = 0;
        if (addSelected && selected.size > 0) {
          const picks = STARTER_STOCKS.filter((s) => selected.has(s.ticker));
          const results = await Promise.allSettled(
            picks.map((s) => addHolding.mutateAsync({ symbol: s.ticker, company_name: s.name, asset_type: 'stock' })),
          );
          added = results.filter((r) => r.status === 'fulfilled').length;
        }
        await markPrompted();
        await refresh();
        setDismissed(true);
        if (added > 0) router.push('/holdings');
      } finally {
        setSaving(false);
      }
    },
    [selected, addHolding, markPrompted, refresh, router],
  );

  if (!isOpen) return null;

  const selectedCount = selected.size;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 16, scale: 0.98 }}
        transition={{ duration: 0.2 }}
        // bottom-24 clears the AIPanelToggle button (fixed bottom-4, h-14) with a gap
        className="fixed bottom-24 right-4 z-40 w-[340px] max-w-[calc(100vw-2rem)] rounded-2xl border border-border bg-background shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <p className="text-sm font-semibold">Build your portfolio</p>
          <button
            type="button"
            onClick={() => dismiss(false)}
            disabled={saving}
            aria-label="Dismiss"
            className="rounded-md p-1 text-muted-foreground/80 transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-3">
          <p className="mb-3 text-xs text-muted-foreground">
            Tap a few stocks you own or want to follow. Optional, and editable anytime.
          </p>

          <div className="-mx-1 max-h-[240px] overflow-y-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="grid grid-cols-2 gap-2">
              {STARTER_STOCKS.map((stock) => {
                const isSelected = selected.has(stock.ticker);
                return (
                  <button
                    key={stock.ticker}
                    type="button"
                    onClick={() => toggleStock(stock.ticker)}
                    aria-pressed={isSelected}
                    aria-label={`${isSelected ? 'Remove' : 'Add'} ${stock.name} (${stock.ticker})`}
                    className={cn(
                      'relative flex min-h-[52px] items-center gap-2 rounded-lg border px-2 py-1.5 text-left transition-all',
                      'hover:border-primary/50 active:scale-[0.98]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border',
                    )}
                  >
                    <CompanyLogo name={stock.name} ticker={stock.ticker} size={26} />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold leading-tight">{stock.ticker}</p>
                      <p className="truncate text-xs text-muted-foreground">{stock.name}</p>
                    </div>
                    <span
                      aria-hidden
                      className={cn(
                        'flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-all',
                        isSelected
                          ? 'scale-100 border-primary bg-primary text-primary-foreground'
                          : 'scale-90 border-border text-transparent',
                      )}
                    >
                      <Check className="h-2.5 w-2.5" strokeWidth={3} />
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 space-y-2">
            <Button
              size="sm"
              className="w-full gap-2"
              onClick={() => dismiss(true)}
              disabled={saving || selectedCount === 0}
            >
              {saving ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Adding…</>
              ) : selectedCount > 0 ? (
                <>Add {selectedCount} {selectedCount === 1 ? 'stock' : 'stocks'} <ArrowRight className="h-3.5 w-3.5" /></>
              ) : (
                'Add holdings'
              )}
            </Button>
            <button
              type="button"
              onClick={() => dismiss(false)}
              disabled={saving}
              className="w-full py-1 text-center text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
            >
              Skip for now
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
