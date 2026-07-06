'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Sparkles, ArrowRight, Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import { useAddOrUpdateHolding } from '@/hooks/use-holdings';
import { createBrowserClient } from '@/lib/supabase/client';

type ExperienceOption = 'beginner' | 'intermediate' | 'advanced';

const EXPERIENCE_OPTIONS: { value: ExperienceOption; label: string; description: string; icon: string }[] = [
  { value: 'beginner',     label: 'New to investing',     description: 'Plain-English explanations for everything', icon: '🌱' },
  { value: 'intermediate', label: 'Some experience',      description: 'Balanced view with helpful context',        icon: '📈' },
  { value: 'advanced',     label: 'Experienced investor', description: 'Full data and financial terminology',        icon: '🏦' },
];

/** Recognisable, diversified starter picks users can add to their portfolio in one tap. */
const STARTER_STOCKS: { ticker: string; name: string }[] = [
  { ticker: 'NVDA', name: 'NVIDIA' },
  { ticker: 'MSFT', name: 'Microsoft' },
  { ticker: 'META', name: 'Meta' },
  { ticker: 'AAPL', name: 'Apple' },
  { ticker: 'AMZN', name: 'Amazon' },
  { ticker: 'TSLA', name: 'Tesla' },
  { ticker: 'NBIS', name: 'Nebius' },
  { ticker: 'MU',   name: 'Micron' },
  { ticker: 'JNJ',  name: 'Johnson & Johnson' },
];

export function OnboardingModal() {
  const { user, isLoading, refresh } = useAuth();
  const { setLevel } = useExperienceLevel();
  const addHolding = useAddOrUpdateHolding();
  const router = useRouter();

  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [selectedLevel, setSelectedLevel] = useState<ExperienceOption | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);

  const isOpen = !isLoading && !!user && user.experience_level === null && !completed;

  const toggleStock = useCallback((ticker: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ticker)) next.delete(ticker);
      else next.add(ticker);
      return next;
    });
  }, []);

  /** Persist preferences, optionally add the chosen holdings, then close into the app. */
  const finalize = useCallback(
    async (addSelected: boolean) => {
      if (!user) return;
      setSaving(true);
      try {
        await setLevel(selectedLevel ?? 'intermediate');

        const supabase = createBrowserClient();
        // We now surface every market regardless — keep a global focus so nothing is filtered out.
        await supabase.from('users').update({ market_focus: 'BOTH' }).eq('id', user.id);

        let added = 0;
        if (addSelected && selected.size > 0) {
          const picks = STARTER_STOCKS.filter((s) => selected.has(s.ticker));
          const results = await Promise.allSettled(
            picks.map((s) =>
              addHolding.mutateAsync({ symbol: s.ticker, company_name: s.name, asset_type: 'stock' }),
            ),
          );
          added = results.filter((r) => r.status === 'fulfilled').length;
        }

        await refresh();
        setCompleted(true);
        // If they built a starter portfolio, drop them into it so the payoff is immediate.
        if (added > 0) router.push('/holdings');
      } finally {
        setSaving(false);
      }
    },
    [user, selectedLevel, selected, setLevel, refresh, addHolding, router],
  );

  const selectedCount = selected.size;

  return (
    <Dialog open={isOpen}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="max-w-md gap-0 overflow-hidden p-0"
      >
        {/* Progress — shown on the two content steps */}
        {step > 0 && (
          <div className="flex justify-center gap-2 pb-1 pt-6">
            {[1, 2].map((s) => (
              <div
                key={s}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  step === s ? 'w-6 bg-primary' : s < step ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-muted',
                )}
              />
            ))}
          </div>
        )}

        <AnimatePresence mode="wait">
          {/* Step 0: Welcome */}
          {step === 0 && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="px-8 py-10 text-center"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/illustrations/bull-welcome.png"
                alt=""
                aria-hidden
                className="mx-auto mb-5 h-auto w-28 select-none opacity-90 dark:opacity-80 dark:invert"
              />
              <DialogHeader className="mb-6 space-y-2">
                <DialogTitle className="text-2xl font-bold">Welcome to BullPen</DialogTitle>
                <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
                  Invest with understanding, not guesswork. Two quick steps and you&apos;re in — no forms, no jargon.
                </DialogDescription>
              </DialogHeader>
              <Button className="w-full gap-2" onClick={() => setStep(1)}>
                Get started <ArrowRight className="h-4 w-4" />
              </Button>
            </motion.div>
          )}

          {/* Step 1: Experience level */}
          {step === 1 && (
            <motion.div
              key="experience"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="px-6 pb-8 pt-4"
            >
              <DialogHeader className="mb-6 text-center">
                <DialogTitle className="text-lg font-semibold">What&apos;s your investing experience?</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  This sets how much detail and jargon we show. You can change it anytime.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {EXPERIENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => { setSelectedLevel(opt.value); setStep(2); }}
                    aria-pressed={selectedLevel === opt.value}
                    className={cn(
                      'flex w-full items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-all',
                      'hover:border-primary/50 hover:bg-primary/5 active:scale-[0.99]',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      selectedLevel === opt.value ? 'border-primary bg-primary/5' : 'border-border',
                    )}
                  >
                    <span className="shrink-0 text-2xl" aria-hidden>{opt.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                    <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-muted-foreground/40" />
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="mt-3 w-full py-2 text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Skip for now
              </button>
            </motion.div>
          )}

          {/* Step 2: Starter holdings */}
          {step === 2 && (
            <motion.div
              key="holdings"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="px-6 pb-6 pt-4"
            >
              <DialogHeader className="mb-5 text-center">
                <DialogTitle className="text-lg font-semibold">Build your portfolio</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  Tap a few stocks you own or want to follow — we&apos;ll add them to your holdings. Optional, and editable anytime.
                </DialogDescription>
              </DialogHeader>

              <div className="-mx-1 max-h-[42vh] overflow-y-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="grid grid-cols-2 gap-2.5">
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
                          'relative flex min-h-[58px] items-center gap-2.5 rounded-xl border px-2.5 py-2 text-left transition-all',
                          'hover:border-primary/50 active:scale-[0.98]',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                          isSelected ? 'border-primary bg-primary/5 ring-1 ring-primary/20' : 'border-border',
                        )}
                      >
                        <CompanyLogo name={stock.name} ticker={stock.ticker} size={34} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold leading-tight">{stock.ticker}</p>
                          <p className="truncate text-xs text-muted-foreground">{stock.name}</p>
                        </div>
                        <span
                          aria-hidden
                          className={cn(
                            'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-all',
                            isSelected
                              ? 'scale-100 border-primary bg-primary text-primary-foreground'
                              : 'scale-90 border-border text-transparent',
                          )}
                        >
                          <Check className="h-3 w-3" strokeWidth={3} />
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 space-y-2.5">
                <Button
                  className="w-full gap-2"
                  onClick={() => finalize(true)}
                  disabled={saving || selectedCount === 0}
                >
                  {saving ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</>
                  ) : selectedCount > 0 ? (
                    <>Add {selectedCount} {selectedCount === 1 ? 'stock' : 'stocks'} <ArrowRight className="h-4 w-4" /></>
                  ) : (
                    <>Add holdings</>
                  )}
                </Button>
                <button
                  type="button"
                  onClick={() => finalize(false)}
                  disabled={saving}
                  className="w-full py-2 text-center text-xs text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                >
                  Skip — take me into the app
                </button>
              </div>

              <div className="mt-4 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" />
                <span>The AI can explain any metric on every stock</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
