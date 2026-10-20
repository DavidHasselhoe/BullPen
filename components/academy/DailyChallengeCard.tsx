'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Flame, CalendarClock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDailyChallenge, type DailySubmitResult } from '@/hooks/use-daily-challenge';
import { Skeleton } from '@/components/ui/skeleton';
import { optionOrder } from '@/lib/academy/option-order';
import { trackEvent } from '@/lib/analytics/track';

/** Hours:minutes until the next ET midnight, for the "resets in" copy. */
function timeUntilEtMidnight(): string {
  const now = new Date();
  const etNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const next = new Date(etNow);
  next.setHours(24, 0, 0, 0);
  const mins = Math.max(0, Math.round((next.getTime() - etNow.getTime()) / 60_000));
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export function DailyChallengeCard() {
  const { t } = useTranslation('academy');
  const { data, isLoading, submit } = useDailyChallenge();
  const [picked, setPicked] = useState<number | null>(null);
  const [result, setResult] = useState<DailySubmitResult | null>(null);

  if (isLoading) {
    return (
      <div
        className="rounded-2xl border border-border/40 bg-card/40 p-5"
        role="status"
        aria-label={t('dailyChallengeLoading')}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-7 rounded-lg shrink-0" />
            <div className="space-y-1.5">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-2.5 w-28" />
            </div>
          </div>
          <Skeleton className="h-3 w-14" />
        </div>

        {/* Question */}
        <Skeleton className="h-4 w-full max-w-[85%] mb-2" />
        <Skeleton className="h-4 w-2/3 mb-4" />

        {/* Options */}
        <div className="grid gap-2">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-11 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  // No challenge configured for today — hide entirely.
  if (!data?.challenge) return null;

  const { challenge } = data;
  const done = data.alreadyDoneToday || result !== null;
  const correctIndex = result?.correctIndex ?? null;
  const wasCorrect = result?.wasCorrect ?? data.wasCorrect ?? null;

  async function handlePick(i: number) {
    if (done || submit.isPending) return;
    setPicked(i);
    try {
      const res = await submit.mutateAsync({ challengeId: challenge!.id, choiceIndex: i });
      setResult(res);
      trackEvent('academy_daily_challenge_answered', { challenge_id: challenge!.id, correct: res.wasCorrect });
    } catch {
      setPicked(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-border bg-card p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted">
            <Flame className="h-4 w-4 text-orange-400" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {t('dailyChallengeTitle')}
            </p>
            <p className="text-[11px] text-muted-foreground">{t('dailyChallengeSubtitle')}</p>
          </div>
        </div>
        <span className="flex items-center gap-1 text-xs font-medium tabular-nums text-muted-foreground">
          <Zap className="h-3 w-3" aria-hidden />
          {t('dailyChallengeXpReward', { xp: challenge.xpReward })}
        </span>
      </div>

      {/* Already done state */}
      {done && data.alreadyDoneToday && !result ? (
        <div className="flex items-center gap-3 rounded-xl border border-border/40 bg-card/40 px-4 py-3">
          <span className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
            wasCorrect ? 'bg-emerald-500/15' : 'bg-amber-400/15',
          )}>
            {wasCorrect ? <Check className="h-4 w-4 text-emerald-500" /> : <X className="h-4 w-4 text-amber-400" />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground">
              {wasCorrect ? t('dailyChallengeSolvedToday') : t('dailyChallengeDoneToday')}
            </p>
            <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-0.5">
              <CalendarClock className="h-3 w-3" /> {t('dailyChallengeNewChallengeIn', { time: timeUntilEtMidnight() })}
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* Question */}
          <p className="text-sm sm:text-base font-semibold text-foreground leading-snug mb-3">
            {challenge.question}
          </p>

          {/* Options */}
          <div className="grid gap-2">
            {/* Shown shuffled; i stays the original index the server grades against. */}
            {optionOrder(challenge.options.length, challenge.question).map((i) => {
              const option = challenge.options[i];
              const isPicked = picked === i;
              const showCorrect = done && correctIndex === i;
              const showWrong = done && isPicked && correctIndex !== i;
              return (
                <motion.button
                  key={i}
                  type="button"
                  disabled={done || submit.isPending}
                  onClick={() => handlePick(i)}
                  whileTap={!done ? { scale: 0.99 } : undefined}
                  className={cn(
                    'flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors duration-200',
                    showCorrect
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : showWrong
                        ? 'border-amber-500 bg-amber-500/10'
                        : done
                          ? 'border-border bg-card opacity-50'
                          : 'cursor-pointer border-border bg-card hover:border-foreground/30',
                  )}
                >
                  <span className="flex-1">{option}</span>
                  {showCorrect && <Check className="h-4 w-4 text-emerald-500 shrink-0" />}
                  {showWrong && <X className="h-4 w-4 text-amber-500 shrink-0" />}
                </motion.button>
              );
            })}
          </div>

          {/* Explanation after answering */}
          <div role="status" aria-live="polite">
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-3 rounded-xl border border-border bg-background/60 p-3.5"
              >
                <div className={cn(
                  'mb-1 flex items-center justify-between text-sm font-semibold',
                  result.wasCorrect ? 'text-emerald-500' : 'text-amber-500',
                )}>
                  <span>{result.wasCorrect ? t('dailyChallengeCorrect') : t('quizLessonIncorrect')}</span>
                  <span className="flex items-center gap-1 tabular-nums text-emerald-500">
                    <Zap className="h-3 w-3" /> {t('dailyChallengeXpReward', { xp: result.xpAwarded })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{result.explanation}</p>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1 mt-2">
                  <CalendarClock className="h-3 w-3" /> {t('dailyChallengeNewChallengeIn', { time: timeUntilEtMidnight() })}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
          </div>
        </>
      )}
    </motion.div>
  );
}
