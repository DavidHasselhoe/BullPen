'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { ScenarioContent } from '@/types/academy';

interface Props {
  content: ScenarioContent;
  onComplete: (score: number) => void;
}

export function ScenarioLesson({ content, onComplete }: Props) {
  const [picked, setPicked] = useState<number | null>(null);
  const answered = picked !== null;
  const choice = picked !== null ? content.choices[picked] : null;

  return (
    <div className="space-y-6">
      {content.image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={content.image}
          alt=""
          className="w-full rounded-2xl border border-border/40 object-cover max-h-72"
        />
      )}

      <div className="rounded-2xl border border-border/40 bg-gradient-to-br from-emerald-500/[0.04] to-transparent p-5 sm:p-6">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-500/80 mb-2">
          Scenario
        </div>
        <p className="text-base sm:text-lg leading-relaxed text-foreground">{content.setup}</p>
      </div>

      <div className="space-y-2.5">
        {content.choices.map((c, i) => {
          const isPicked = picked === i;
          const isDimmed = answered && !isPicked;
          return (
            <motion.button
              key={i}
              type="button"
              disabled={answered}
              onClick={() => setPicked(i)}
              whileHover={!answered ? { scale: 1.005 } : undefined}
              whileTap={!answered ? { scale: 0.99 } : undefined}
              animate={
                isPicked
                  ? { scale: 1.02, borderColor: 'rgb(16,185,129)' }
                  : isDimmed
                    ? { opacity: 0.4 }
                    : {}
              }
              className={cn(
                'w-full text-left rounded-xl border border-border bg-card px-4 py-3.5',
                'text-sm sm:text-base transition-colors',
                !answered && 'hover:border-foreground/30 cursor-pointer'
              )}
            >
              {c.label}
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {choice && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
            className={cn(
              'rounded-2xl border p-4 sm:p-5',
              choice.isCorrect
                ? 'border-emerald-500/30 bg-emerald-500/[0.06]'
                : 'border-amber-400/30 bg-amber-400/[0.06]'
            )}
          >
            <div
              className={cn(
                'flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] mb-2',
                choice.isCorrect ? 'text-emerald-500' : 'text-amber-400'
              )}
            >
              <Sparkles className="h-3 w-3" />
              {choice.isCorrect ? 'Solid call' : 'Let’s rethink that'}
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">{choice.feedback}</p>
            <Button
              onClick={() => onComplete(choice.isCorrect ? 1 : 0)}
              size="lg"
              className="w-full mt-4 bg-emerald-500 hover:bg-emerald-600 text-white font-semibold"
            >
              Continue
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
