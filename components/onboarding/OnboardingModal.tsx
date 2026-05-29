'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, TrendingUp, Globe, Sparkles, ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAuth } from '@/components/auth/AuthProvider';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import { createBrowserClient } from '@/lib/supabase/client';

type ExperienceOption = 'beginner' | 'intermediate' | 'advanced';
type MarketOption = 'US' | 'EU' | 'BOTH';

const EXPERIENCE_OPTIONS: { value: ExperienceOption; label: string; description: string; icon: string }[] = [
  { value: 'beginner',     label: 'New to investing',      description: 'Plain-English explanations for everything', icon: '🌱' },
  { value: 'intermediate', label: 'Some experience',       description: 'Balanced view with helpful context',        icon: '📈' },
  { value: 'advanced',     label: 'Experienced investor',  description: 'Full data and financial terminology',       icon: '🏦' },
];

const MARKET_OPTIONS: { value: MarketOption; label: string; description: string; flag: string }[] = [
  { value: 'US',   label: 'US Markets',         description: 'NYSE, NASDAQ, S&P 500',            flag: '🇺🇸' },
  { value: 'EU',   label: 'European Markets',   description: 'LSE, Euronext, DAX, OMXS30',       flag: '🇪🇺' },
  { value: 'BOTH', label: 'Both',               description: 'Global coverage',                  flag: '🌍' },
];

export function OnboardingModal() {
  const { user, isLoading, refresh } = useAuth();
  const { setLevel } = useExperienceLevel();

  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [selectedLevel, setSelectedLevel] = useState<ExperienceOption | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<MarketOption | null>(null);
  const [saving, setSaving] = useState(false);
  const [completed, setCompleted] = useState(false);

  const isOpen = !isLoading && !!user && user.experience_level === null && !completed;

  const handleComplete = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    try {
      await setLevel(selectedLevel ?? 'intermediate');
      const supabase = createBrowserClient();
      await supabase
        .from('users')
        .update({ market_focus: selectedMarket ?? 'US' })
        .eq('id', user.id);
      await refresh();
      setCompleted(true);
    } finally {
      setSaving(false);
    }
  }, [user, selectedLevel, selectedMarket, setLevel, refresh]);

  const handleSkip = useCallback(async () => {
    if (!user) return;
    setSaving(true);
    try {
      await setLevel('intermediate');
      const supabase = createBrowserClient();
      await supabase
        .from('users')
        .update({ market_focus: 'US' })
        .eq('id', user.id);
      await refresh();
      setCompleted(true);
    } finally {
      setSaving(false);
    }
  }, [user, setLevel, refresh]);

  return (
    <Dialog open={isOpen}>
      <DialogContent
        showCloseButton={false}
        onInteractOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="max-w-md p-0 overflow-hidden gap-0"
      >
        {/* Progress dots — hidden on welcome step */}
        {step > 0 && step < 3 && (
          <div className="flex justify-center gap-2 pt-6 pb-2">
            {[1, 2].map((s) => (
              <div
                key={s}
                className={cn(
                  'h-1.5 rounded-full transition-all duration-300',
                  step === s ? 'w-6 bg-primary' : s < step ? 'w-1.5 bg-primary/50' : 'w-1.5 bg-muted'
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
              <div className="mb-6 flex justify-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
                  <TrendingUp className="h-8 w-8 text-primary" />
                </div>
              </div>
              <DialogHeader className="space-y-2 mb-6">
                <DialogTitle className="text-2xl font-bold">Welcome to BullPen</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                  Invest with understanding, not guesswork. Let&apos;s personalise your experience so the app works exactly the way you need it.
                </DialogDescription>
              </DialogHeader>
              <Button
                className="w-full gap-2"
                onClick={() => setStep(1)}
              >
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
                  This sets how data and explanations are shown. You can change it anytime.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {EXPERIENCE_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setSelectedLevel(opt.value); setStep(2); }}
                    className={cn(
                      'w-full flex items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-all',
                      'hover:border-primary/50 hover:bg-primary/5',
                      selectedLevel === opt.value ? 'border-primary bg-primary/5' : 'border-border'
                    )}
                  >
                    <span className="text-2xl shrink-0">{opt.icon}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={handleSkip}
                disabled={saving}
                className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip for now
              </button>
            </motion.div>
          )}

          {/* Step 2: Market focus */}
          {step === 2 && (
            <motion.div
              key="market"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="px-6 pb-8 pt-4"
            >
              <DialogHeader className="mb-6 text-center">
                <DialogTitle className="text-lg font-semibold">Which markets do you follow?</DialogTitle>
                <DialogDescription className="text-xs text-muted-foreground">
                  We&apos;ll surface the most relevant data and news for you.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                {MARKET_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => { setSelectedMarket(opt.value); setStep(3); }}
                    className={cn(
                      'w-full flex items-center gap-4 rounded-xl border px-4 py-3.5 text-left transition-all',
                      'hover:border-primary/50 hover:bg-primary/5',
                      selectedMarket === opt.value ? 'border-primary bg-primary/5' : 'border-border'
                    )}
                  >
                    <span className="text-2xl shrink-0">{opt.flag}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={handleSkip}
                disabled={saving}
                className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip for now
              </button>
            </motion.div>
          )}

          {/* Step 3: Done */}
          {step === 3 && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25 }}
              className="px-8 py-10 text-center"
            >
              <div className="mb-6 flex justify-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 20, delay: 0.1 }}
                  className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10"
                >
                  <CheckCircle2 className="h-8 w-8 text-emerald-500" />
                </motion.div>
              </div>
              <DialogHeader className="space-y-2 mb-2">
                <DialogTitle className="text-2xl font-bold">You&apos;re all set!</DialogTitle>
                <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
                  Try searching a company you know — Apple, Tesla, or any stock you&apos;re curious about. The AI can explain anything you don&apos;t understand.
                </DialogDescription>
              </DialogHeader>
              <div className="flex items-center justify-center gap-1.5 mb-6 text-xs text-muted-foreground">
                <Sparkles className="h-3 w-3 text-primary" />
                <span>AI-powered explanations on every metric</span>
              </div>
              <Button
                className="w-full gap-2"
                onClick={handleComplete}
                disabled={saving}
              >
                {saving ? 'Saving…' : 'Start exploring'} <ArrowRight className="h-4 w-4" />
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
