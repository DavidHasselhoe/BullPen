'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X, Flame, CalendarClock, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDailyChallenge, type DailySubmitResult } from '@/hooks/use-daily-challenge';
import { Skeleton } from '@/components/ui/skeleton';

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
    } catch {
      setPicked(null);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.07] to-transparent p-5"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-500/15">
            <Flame className="h-4 w-4 text-emerald-500" />
          </span>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-emerald-600 dark:text-emerald-400">
              {t('dailyChallengeTitle')}
            </p>
            <p className="text-[11px] text-muted-foreground/85">{t('dailyChallengeSubtitle')}</p>
          </div>
        </div>
        <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-600/80 dark:text-emerald-400/80">
          <Zap className="h-3 w-3" />
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
            <p className="text-[11px] text-muted-foreground/85 flex items-center gap-1 mt-0.5">
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
            {challenge.options.map((option, i) => {
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
                  animate={
                    showCorrect
                      ? { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgb(34,197,94)' }
                      : showWrong
                        ? { backgroundColor: 'rgba(245,158,11,0.10)', borderColor: 'rgb(245,158,11)' }
                        : done
                          ? { opacity: 0.45 }
                          : {}
                  }
                  className={cn(
                    'flex items-center justify-between gap-3 text-left rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm transition-colors',
                    !done && 'hover:border-foreground/30 cursor-pointer',
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
          <AnimatePresence>
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  'mt-3 rounded-xl border p-3.5',
                  result.wasCorrect
                    ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
                    : 'border-amber-400/30 bg-amber-400/[0.06]',
                )}
              >
                <div className={cn(
                  'text-[11px] font-bold uppercase tracking-[0.18em] mb-1 flex items-center justify-between',
                  result.wasCorrect ? 'text-emerald-500' : 'text-amber-500',
                )}>
                  <span>{result.wasCorrect ? t('dailyChallengeCorrect') : t('quizLessonIncorrect')}</span>
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <Zap className="h-3 w-3" /> {t('dailyChallengeXpReward', { xp: result.xpAwarded })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{result.explanation}</p>
                <p className="text-[11px] text-muted-foreground/80 flex items-center gap-1 mt-2">
                  <CalendarClock className="h-3 w-3" /> {t('dailyChallengeNewChallengeIn', { time: timeUntilEtMidnight() })}
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}
    </motion.div>
  );
}
