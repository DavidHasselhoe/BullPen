'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import type { ReadContent } from '@/types/academy';

interface Props {
  content: ReadContent;
  onComplete: () => void;
}

interface HighlightedTermProps {
  term: string;
  definition: string;
}

function HighlightedTerm({ term, definition }: HighlightedTermProps) {
  const { t } = useTranslation('academy');
  const [open, setOpen] = useState(false);
  const { open: openAIPanel } = useAIPanel();

  // Deeper explanations go through the global AI Assistant instead of an inline
  // fetch — same surface as the rest of the app, and lets the user ask follow-ups.
  function askAI() {
    setOpen(false);
    openAIPanel({
      query: t('readLessonAskAiQuery', { term, definition }),
    });
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline rounded px-0.5 font-medium text-foreground underline decoration-foreground/40 decoration-dotted underline-offset-[3px] transition-colors hover:bg-muted hover:decoration-foreground"
        >
          {term}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="space-y-3">
        <div>
          <div className="mb-1 text-sm font-semibold text-foreground">{term}</div>
          <p className="text-sm text-foreground leading-relaxed">{definition}</p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={askAI}
          className="w-full gap-1.5 text-xs h-7"
        >
          <Sparkles className="h-3 w-3" />
          {t('readLessonAskAiForMore')}
        </Button>
      </PopoverContent>
    </Popover>
  );
}

function renderTextWithHighlights(text: string, terms: HighlightedTermProps[]) {
  if (terms.length === 0) return text;
  // Escape regex metachars in terms and sort longest-first to avoid sub-term collisions.
  const sorted = [...terms].sort((a, b) => b.term.length - a.term.length);
  const escaped = sorted.map((t) => t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const re = new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi');
  const parts = text.split(re);

  return parts.map((part, i) => {
    const match = sorted.find((t) => t.term.toLowerCase() === part.toLowerCase());
    if (match) {
      return <HighlightedTerm key={`t-${i}`} term={match.term} definition={match.definition} />;
    }
    return <span key={`s-${i}`}>{part}</span>;
  });
}

/**
 * One section per screen, the way a lesson game paces it: read a few lines,
 * tap Continue, see how far through you are. It used to render every section
 * at once as a stack of cards, which read as a page of a textbook.
 */
export function ReadLesson({ content, onComplete }: Props) {
  const { t } = useTranslation('academy');
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);
  const continueRef = useRef<HTMLButtonElement>(null);
  const total = content.sections.length;
  const isLast = step === total - 1;
  const section = content.sections[step];

  // Enter keeps going, and a long section on a phone starts from its top.
  useEffect(() => {
    continueRef.current?.focus({ preventScroll: true });
    if (step > 0) window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
  }, [step, reduced]);

  return (
    <div className="space-y-6">
      <div
        className="flex gap-1.5"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step + 1}
        aria-label={t('readLessonProgress', { current: step + 1, total })}
      >
        {content.sections.map((_, i) => (
          <div key={i} className={cn('h-1 flex-1 rounded-full transition-colors duration-300', i <= step ? 'bg-foreground' : 'bg-muted')} />
        ))}
      </div>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={step}
          initial={reduced ? false : { opacity: 0, x: 12 }}
          animate={{ opacity: 1, x: 0 }}
          exit={reduced ? undefined : { opacity: 0, x: -8 }}
          transition={{ duration: 0.2, ease: [0.25, 1, 0.5, 1] }}
          className="space-y-5"
        >
          <p className="text-lg leading-relaxed text-foreground sm:text-xl sm:leading-relaxed">
            {renderTextWithHighlights(section.text, section.highlightedTerms)}
          </p>

          {isLast && content.funFact && (
            <aside className="rounded-xl bg-muted/50 px-4 py-3.5">
              <p className="mb-1 text-sm font-semibold text-foreground">{t('readLessonFunFact')}</p>
              <p className="text-sm leading-relaxed text-muted-foreground">{content.funFact}</p>
            </aside>
          )}
        </motion.div>
      </AnimatePresence>

      <div className="grid gap-2 pt-2">
        <Button
          ref={continueRef}
          onClick={() => (isLast ? onComplete() : setStep((n) => n + 1))}
          size="lg"
          className="w-full font-semibold"
        >
          {t('scenarioLessonContinue')}
        </Button>
        {step > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={() => setStep((n) => n - 1)} className="text-muted-foreground">
            {t('lessonPlayerBack')}
          </Button>
        )}
      </div>
    </div>
  );
}
