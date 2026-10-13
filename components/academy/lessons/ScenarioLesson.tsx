'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ScenarioContent } from '@/types/academy';
import { optionOrder } from '@/lib/academy/option-order';

interface Props {
  content: ScenarioContent;
  onComplete: (score: number) => void;
}

export function ScenarioLesson({ content, onComplete }: Props) {
  const { t } = useTranslation('academy');
  const [picked, setPicked] = useState<number | null>(null);
  // The first pick is what scores; trying again is for learning, not for XP.
  const [firstPickCorrect, setFirstPickCorrect] = useState<boolean | null>(null);
  const [tried, setTried] = useState<number[]>([]);
  const answered = picked !== null;
  const choice = picked !== null ? content.choices[picked] : null;
  const actionRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (answered) actionRef.current?.focus({ preventScroll: true });
  }, [answered]);

  function pick(i: number) {
    if (answered) return;
    setPicked(i);
    setTried((t) => [...t, i]);
    if (firstPickCorrect === null) setFirstPickCorrect(!!content.choices[i].isCorrect);
  }

  return (
    <div className="space-y-6">
      {content.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={content.image}
          alt=""
          className="max-h-72 w-full rounded-2xl border border-border/40 object-cover"
        />
      )}

      <p className="rounded-2xl bg-muted/40 p-5 text-base leading-relaxed text-foreground sm:p-6 sm:text-lg">{content.setup}</p>

      <div className="space-y-2.5">
        {/* Shown shuffled; i stays the choice's original index. */}
        {optionOrder(content.choices.length, content.setup).map((i) => {
          const c = content.choices[i];
          const isPicked = picked === i;
          const ruledOut = tried.includes(i) && !isPicked;
          return (
            <motion.button
              key={i}
              type="button"
              disabled={answered || ruledOut}
              onClick={() => pick(i)}
              whileTap={!answered ? { scale: 0.99 } : undefined}
              className={cn(
                'w-full rounded-xl border px-4 py-3.5 text-left text-sm transition-colors duration-200 sm:text-base',
                isPicked
                  ? c.isCorrect
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-amber-500 bg-amber-500/10'
                  : answered || ruledOut
                    ? 'border-border bg-card opacity-50'
                    : 'cursor-pointer border-border bg-card hover:border-foreground/30'
              )}
            >
              {c.label}
            </motion.button>
          );
        })}
      </div>

      <div role="status" aria-live="polite">
        <AnimatePresence>
          {choice && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25 }}
              className="rounded-2xl border border-border bg-card p-4 sm:p-5"
            >
              <p className={cn('mb-2 flex items-center gap-1.5 text-sm font-semibold', choice.isCorrect ? 'text-emerald-500' : 'text-amber-500')}>
                {choice.isCorrect ? <Check className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
                {choice.isCorrect ? t('scenarioLessonSolidCall') : t('scenarioLessonRethink')}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">{choice.feedback}</p>
              {choice.isCorrect ? (
                <Button ref={actionRef} onClick={() => onComplete(firstPickCorrect ? 1 : 0)} size="lg" className="mt-4 w-full font-semibold">
                  {t('scenarioLessonContinue')}
                </Button>
              ) : (
                <div className="mt-4 grid gap-2">
                  <Button ref={actionRef} onClick={() => setPicked(null)} size="lg" variant="outline" className="w-full gap-2 font-semibold">
                    <RotateCcw className="h-4 w-4" aria-hidden />
                    {t('scenarioLessonTryAnother')}
                  </Button>
                  <Button onClick={() => onComplete(0)} size="sm" variant="ghost" className="text-muted-foreground">
                    {t('scenarioLessonContinue')}
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
