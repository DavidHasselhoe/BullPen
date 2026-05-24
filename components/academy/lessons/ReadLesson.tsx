'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
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
  const [aiText, setAiText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [errored, setErrored] = useState(false);

  async function askAI() {
    if (loading || aiText) return;
    setLoading(true);
    setErrored(false);
    setAiText('');

    try {
      const res = await fetch('/api/academy/explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ term, context: definition }),
      });
      if (!res.ok || !res.body) {
        setErrored(true);
        setLoading(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let acc = '';
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        buffer = events.pop() ?? '';
        for (const e of events) {
          if (!e.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(e.slice(6)) as { type: string; delta?: string };
            if (parsed.type === 'text' && parsed.delta) {
              acc += parsed.delta;
              setAiText(acc);
            } else if (parsed.type === 'error') {
              setErrored(true);
            }
          } catch {
            /* skip malformed */
          }
        }
      }
    } catch {
      setErrored(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Popover>
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

        {aiText !== null && (
          <div className="rounded-md bg-muted/40 border border-border/40 px-2.5 py-2 text-xs leading-relaxed text-muted-foreground">
            {errored ? (
              <span className="text-red-400">Couldn&apos;t reach the AI. Try again.</span>
            ) : (
              <>
                <span className="text-emerald-500/80 font-medium">AI: </span>
                {aiText}
                {loading && (
                  <span className="inline-block w-1.5 h-3 ml-0.5 align-middle bg-emerald-500/60 animate-pulse" />
                )}
              </>
            )}
          </div>
        )}

        {aiText === null && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={askAI}
            disabled={loading}
            className="w-full gap-1.5 text-xs h-7"
          >
            {loading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 text-emerald-500" />
            )}
            Ask AI for more
          </Button>
        )}
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
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-400/70 mb-1.5">
            Fun fact
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
          Continue
        </Button>
      </div>
    </div>
  );
}
