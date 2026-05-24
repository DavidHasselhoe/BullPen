'use client';

import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { MatchContent } from '@/types/academy';

interface Props {
  content: MatchContent;
  onComplete: () => void;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

interface Pair {
  index: number;
  term: string;
  definition: string;
}

export function MatchLesson({ content, onComplete }: Props) {
  const pairs: Pair[] = useMemo(
    () => content.pairs.map((p, i) => ({ index: i, term: p.term, definition: p.definition })),
    [content.pairs]
  );

  const shuffledDefs = useMemo(() => shuffle(pairs), [pairs]);

  const [selectedTermIdx, setSelectedTermIdx] = useState<number | null>(null);
  const [matchedSet, setMatchedSet] = useState<Set<number>>(new Set());
  const [wrongPair, setWrongPair] = useState<{ termIdx: number; defIdx: number } | null>(null);

  const allMatched = matchedSet.size === pairs.length;

  // Clear wrong-pair shake after the animation finishes
  useEffect(() => {
    if (!wrongPair) return;
    const t = setTimeout(() => setWrongPair(null), 320);
    return () => clearTimeout(t);
  }, [wrongPair]);

  function handleTermClick(idx: number) {
    if (matchedSet.has(idx)) return;
    setSelectedTermIdx(idx === selectedTermIdx ? null : idx);
  }

  function handleDefClick(defOriginalIdx: number) {
    if (matchedSet.has(defOriginalIdx)) return;
    if (selectedTermIdx === null) return;

    if (selectedTermIdx === defOriginalIdx) {
      // Correct match
      setMatchedSet((s) => new Set(s).add(selectedTermIdx));
      setSelectedTermIdx(null);
    } else {
      setWrongPair({ termIdx: selectedTermIdx, defIdx: defOriginalIdx });
      setSelectedTermIdx(null);
    }
  }

  const shakeAnim = (active: boolean) =>
    active ? { x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.32 } } : {};

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Tap a term, then tap its definition. Match all {pairs.length} pairs.
      </p>

      <div className="grid grid-cols-2 gap-3 sm:gap-4">
        {/* Terms column */}
        <div className="space-y-2.5">
          {pairs.map((p) => {
            const isMatched = matchedSet.has(p.index);
            const isSelected = selectedTermIdx === p.index;
            const isWrong = wrongPair?.termIdx === p.index;
            return (
              <motion.button
                key={`t-${p.index}`}
                type="button"
                disabled={isMatched}
                onClick={() => handleTermClick(p.index)}
                whileTap={!isMatched ? { scale: 0.97 } : undefined}
                animate={shakeAnim(!!isWrong)}
                className={cn(
                  'w-full rounded-xl border px-3 py-3 text-sm font-medium text-left transition-colors',
                  isMatched
                    ? 'border-emerald-500/40 bg-emerald-500/[0.08] text-emerald-500 cursor-default'
                    : isSelected
                      ? 'border-emerald-500 bg-emerald-500/[0.10] text-foreground'
                      : 'border-border bg-card hover:border-foreground/30 text-foreground'
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span>{p.term}</span>
                  {isMatched && <Check className="h-3.5 w-3.5 shrink-0" />}
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Definitions column (shuffled) */}
        <div className="space-y-2.5">
          {shuffledDefs.map((p) => {
            const isMatched = matchedSet.has(p.index);
            const isWrong = wrongPair?.defIdx === p.index;
            return (
              <motion.button
                key={`d-${p.index}`}
                type="button"
                disabled={isMatched}
                onClick={() => handleDefClick(p.index)}
                whileTap={!isMatched ? { scale: 0.97 } : undefined}
                animate={shakeAnim(!!isWrong)}
                className={cn(
                  'w-full rounded-xl border px-3 py-3 text-xs sm:text-sm text-left transition-colors leading-relaxed',
                  isMatched
                    ? 'border-emerald-500/40 bg-emerald-500/[0.08] text-muted-foreground/80 cursor-default'
                    : selectedTermIdx !== null
                      ? 'border-border bg-card hover:border-emerald-500/40 text-foreground cursor-pointer'
                      : 'border-border bg-card text-muted-foreground'
                )}
              >
                {p.definition}
              </motion.button>
            );
          })}
        </div>
      </div>

      <AnimatePresence>
        {allMatched && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25 }}
          >
            <Button
              onClick={onComplete}
              size="lg"
              className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold"
            >
              All matched — continue
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
