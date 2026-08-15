'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { QuizContent } from '@/types/academy';

interface Props {
  content: QuizContent;
  onComplete: (score: number) => void;
}

export function QuizLesson({ content, onComplete }: Props) {
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [correctCount, setCorrectCount] = useState(0);

  const total = content.questions.length;
  const question = content.questions[index];
  const isLast = index === total - 1;
  const isCorrect = picked !== null && picked === question.correctIndex;
  const answered = picked !== null;

  function handlePick(i: number) {
    if (answered) return;
    setPicked(i);
    if (i === question.correctIndex) {
      setCorrectCount((c) => c + 1);
    }
  }

  function handleNext() {
    if (isLast) {
      onComplete(correctCount / total);
      return;
    }
    setIndex((i) => i + 1);
    setPicked(null);
  }

  return (
    <div className="space-y-6">
      {/* Progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex-1 h-1.5 rounded-full bg-muted/40 overflow-hidden">
          <motion.div
            className="h-full bg-emerald-500 rounded-full"
            initial={false}
            animate={{ width: `${((index + (answered ? 1 : 0)) / total) * 100}%` }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
          />
        </div>
        <span className="text-xs font-mono text-muted-foreground tabular-nums">
          {index + 1}/{total}
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
          <h2 className="text-xl sm:text-2xl font-semibold leading-tight text-foreground">
            {question.question}
          </h2>

          <div className="grid gap-2.5">
            {question.options.map((option, i) => {
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
                  whileHover={!answered ? { scale: 1.005 } : undefined}
                  whileTap={!answered ? { scale: 0.99 } : undefined}
                  animate={
                    showAsCorrect
                      ? { backgroundColor: 'rgba(34,197,94,0.12)', borderColor: 'rgb(34,197,94)' }
                      : showAsWrong
                        ? { backgroundColor: 'rgba(239,68,68,0.10)', borderColor: 'rgb(239,68,68)' }
                        : answered
                          ? { opacity: 0.45 }
                          : {}
                  }
                  className={cn(
                    'flex items-center justify-between gap-3 text-left',
                    'rounded-xl border border-border bg-card px-4 py-3.5',
                    'transition-colors text-sm sm:text-base',
                    !answered && 'hover:border-foreground/30 cursor-pointer'
                  )}
                >
                  <span className="flex-1">{option}</span>
                  {showAsCorrect && <Check className="h-4 w-4 text-emerald-500 shrink-0" />}
                  {showAsWrong && <X className="h-4 w-4 text-red-500 shrink-0" />}
                </motion.button>
              );
            })}
          </div>
        </motion.div>
      </AnimatePresence>

      <AnimatePresence>
        {answered && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className={cn(
              'rounded-2xl border p-4 sm:p-5',
              isCorrect
                ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
                : 'border-amber-400/30 bg-amber-400/[0.06]'
            )}
          >
            <div
              className={cn(
                'text-[11px] font-bold uppercase tracking-[0.18em] mb-1.5',
                isCorrect ? 'text-emerald-500' : 'text-amber-400'
              )}
            >
              {isCorrect ? 'Nice — that’s right' : 'Not quite'}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {question.explanation}
            </p>
            <Button
              onClick={handleNext}
              size="lg"
              className="w-full mt-4 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold"
            >
              {isLast ? 'Finish' : 'Next question'}
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
