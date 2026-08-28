'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
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
          className="inline text-emerald-500 underline decoration-emerald-500/40 decoration-dotted underline-offset-[3px] hover:decoration-emerald-500 hover:bg-emerald-500/5 rounded px-0.5 transition-colors"
        >
          {term}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="space-y-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-emerald-500 mb-1">
            {term}
          </div>
          <p className="text-sm text-foreground leading-relaxed">{definition}</p>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={askAI}
          className="w-full gap-1.5 text-xs h-7"
        >
          <Sparkles className="h-3 w-3 text-emerald-500" />
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

export function ReadLesson({ content, onComplete }: Props) {
  const { t } = useTranslation('academy');
  return (
    <div className="space-y-6">
      {content.sections.map((section, i) => (
        <motion.div
          key={i}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: i * 0.06 }}
          className={cn(
            'rounded-2xl border border-border/40 bg-gradient-to-br from-emerald-500/[0.03] to-transparent p-5 sm:p-6'
          )}
        >
          <p className="text-base sm:text-lg leading-relaxed text-foreground">
            {renderTextWithHighlights(section.text, section.highlightedTerms)}
          </p>
        </motion.div>
      ))}

      {content.funFact && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, delay: content.sections.length * 0.06 }}
          className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.04] p-4 sm:p-5"
        >
          <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-400/70 mb-1.5">
            {t('readLessonFunFact')}
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{content.funFact}</p>
        </motion.div>
      )}

      <div className="pt-2">
        <Button
          onClick={onComplete}
          size="lg"
          className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-semibold"
        >
          {t('scenarioLessonContinue')}
        </Button>
      </div>
    </div>
  );
}
