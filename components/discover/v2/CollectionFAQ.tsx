'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface FAQEntry {
  id: string;
  question: string;
  answer: string;
}

/**
 * Why each "Worth a look" list exists, collapsed by default.
 *
 * This reasoning used to sit as a paragraph under every list, always on screen
 * whether or not anyone read it. Same restraint as the sector accordion above:
 * one row open at a time, closed by default, so the page states its reasoning
 * without forcing everyone to scroll past four paragraphs to reach the tickers.
 */
export function CollectionFAQ({ items }: { items: FAQEntry[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const prefersReducedMotion = useReducedMotion();

  if (items.length === 0) return null;

  return (
    <section aria-labelledby="collection-faq-heading" className="mt-8">
      <h3
        id="collection-faq-heading"
        className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/80"
      >
        Why these lists
      </h3>
      <div className="overflow-hidden rounded-xl border border-border/50 bg-card/40">
        {items.map((item) => {
          const expanded = openId === item.id;
          const panelId = `faq-panel-${item.id}`;
          return (
            <div key={item.id} className="border-b border-border/25 last:border-b-0">
              <button
                type="button"
                onClick={() => setOpenId(expanded ? null : item.id)}
                aria-expanded={expanded}
                aria-controls={panelId}
                className={cn(
                  'flex w-full items-center justify-between gap-3 px-4 py-3 text-left',
                  'transition-colors duration-150 hover:bg-muted/25',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                )}
              >
                <span className="text-[13px] font-medium text-foreground">{item.question}</span>
                <ChevronDown
                  className={cn(
                    'h-3.5 w-3.5 shrink-0 text-muted-foreground/80 transition-transform duration-200',
                    expanded && 'rotate-180',
                  )}
                  aria-hidden
                />
              </button>

              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    id={panelId}
                    key="panel"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: prefersReducedMotion ? 0 : 0.22, ease: [0.16, 1, 0.3, 1] }}
                    className="overflow-hidden"
                  >
                    <p className="px-4 pb-3.5 text-[13px] leading-relaxed text-muted-foreground">
                      {item.answer}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </section>
  );
}
