'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { QuizContent } from '@/types/academy';
import { optionOrder } from '@/lib/academy/option-order';

interface Props {
  content: QuizContent;
  onComplete: (score: number, answers: number[]) => void;
}

export function QuizLesson({ content, onComplete }: Props) {
  const { t } = useTranslation('academy');
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);
  const [answers, setAnswers] = useState<number[]>([]);

  const total = content.questions.length;
  const question = content.questions[index];
  const isLast = index === total - 1;
  const isCorrect = picked !== null && picked === question.correctIndex;
  const answered = picked !== null;
  const order = optionOrder(question.options.length, question.question);
  const nextRef = useRef<HTMLButtonElement>(null);

  function handlePick(i: number) {
    if (answered) return;
    setPicked(i);
    setAnswers((a) => [...a, i]);
    if (i === question.correctIndex) {
      setCorrectCount((c) => c + 1);
    }
  }

  function handleNext() {
    if (isLast) {
      onComplete(correctCount / total, answers);
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
  }

  // Feedback takes focus so Enter moves on, and keyboard users aren't left on a
  // disabled option with focus dropped to the page.
  useEffect(() => {
    if (answered) nextRef.current?.focus({ preventScroll: true });
  }, [answered]);

  // 1-4 picks the option shown in that position.
  useEffect(() => {
    if (answered) return;
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      const n = Number(e.key);
      if (Number.isInteger(n) && n >= 1 && n <= order.length) handlePick(order[n - 1]);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex flex-1 gap-1.5" aria-hidden>
          {content.questions.map((_, i) => (
            <div key={i} className={cn('h-1 flex-1 rounded-full transition-colors duration-300', i < index + (answered ? 1 : 0) ? 'bg-foreground' : 'bg-muted')} />
          ))}
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {t('quizLessonProgress', { current: index + 1, total })}
        </span>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -16 }}
          transition={{ duration: 0.2 }}
          className="space-y-5"
        >
          <h2 className="text-xl font-semibold leading-tight text-foreground sm:text-2xl">
            {question.question}
          </h2>

          <div className="grid gap-2.5">
            {/* Shown shuffled; i stays the option's original index, so scoring is unchanged. */}
            {order.map((i, pos) => {
              const option = question.options[i];
              const isPicked = picked === i;
              const isThisCorrect = i === question.correctIndex;
              const showAsCorrect = answered && isThisCorrect;
              const showAsWrong = answered && isPicked && !isThisCorrect;

              return (
                <motion.button
                  key={i}
                  type="button"
                  disabled={answered}
                  onClick={() => handlePick(i)}
                  whileTap={!answered ? { scale: 0.99 } : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm transition-colors duration-200 sm:text-base',
                    showAsCorrect
                      ? 'border-emerald-500 bg-emerald-500/10'
                      : showAsWrong
                        ? 'border-amber-500 bg-amber-500/10'
                        : answered
                          ? 'border-border bg-card opacity-50'
                          : 'cursor-pointer border-border bg-card hover:border-foreground/30'
                  )}
                >
                  <span
                    aria-hidden
                    className="hidden h-6 w-6 shrink-0 items-center justify-center rounded-md border border-border text-xs tabular-nums text-muted-foreground sm:flex"
                  >
                    {pos + 1}
                  </span>
                  <span className="flex-1">{option}</span>
                  {showAsCorrect && <Check className="h-4 w-4 shrink-0 text-emerald-500" aria-label={t('quizLessonCorrect')} />}
                  {showAsWrong && <X className="h-4 w-4 shrink-0 text-amber-500" aria-label={t('quizLessonIncorrect')} />}
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>

      <div role="status" aria-live="polite">
        <AnimatePresence>
          {answered && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="rounded-2xl border border-border bg-card p-4 sm:p-5"
            >
              <p className={cn('mb-1.5 flex items-center gap-1.5 text-sm font-semibold', isCorrect ? 'text-emerald-500' : 'text-amber-500')}>
                {isCorrect ? <Check className="h-4 w-4" aria-hidden /> : <X className="h-4 w-4" aria-hidden />}
                {isCorrect ? t('quizLessonCorrect') : t('quizLessonIncorrect')}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">{question.explanation}</p>
              <Button ref={nextRef} onClick={handleNext} size="lg" className="mt-4 w-full font-semibold">
                {isLast ? t('quizLessonFinish') : t('quizLessonNextQuestion')}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
