'use client';

import type { ReactNode } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getGlossaryEntry } from '@/lib/finance/glossary';
import { HelpCircle } from 'lucide-react';

// Jargon terms Deep Dive prose uses without explanation (RPO, FCF, EV/EBITDA,
// TTM/NTM, constant-currency growth, YoY, forward P/E, gross/operating
// margin). Deliberately a short curated list, not the full ~150-entry
// GLOSSARY — sweeping every mention of "Revenue" or "Growth" would recreate
// the wall-of-tooltips density problem this component exists to fix.
const DEEP_DIVE_JARGON_TERMS = [
  'EV/EBITDA', 'Forward P/E', 'Fwd P/E', 'Constant Currency',
  'Operating Margin', 'Gross Margin', 'RPO', 'FCF', 'TTM', 'NTM', 'YoY',
].sort((a, b) => b.length - a.length);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Multi-word terms (e.g. "Constant Currency") show up in AI prose as either
// "constant currency" or "constant-currency" — match either by treating the
// space as a flexible separator rather than a literal character.
function termPattern(term: string): string {
  return escapeRegExp(term).replace(/\s+/g, '[\\s-]+');
}

const JARGON_REGEX = new RegExp(`\\b(${DEEP_DIVE_JARGON_TERMS.map(termPattern).join('|')})\\b`, 'gi');

// GLOSSARY is keyed by exact casing ("TTM", not "ttm") and a literal space
// ("Constant Currency"), so a lowercase or hyphenated mention in AI-generated
// prose still needs to resolve to the right entry.
function canonicalTerm(matched: string): string | undefined {
  const normalized = matched.toLowerCase().replace(/[\s-]+/g, ' ');
  return DEEP_DIVE_JARGON_TERMS.find((t) => t.toLowerCase() === normalized);
}

/**
 * Renders `text` with the first mention of each Deep Dive jargon term (per
 * `seen`) wrapped in a hover tooltip; later mentions render as plain text.
 *
 * Deliberately a plain function, NOT a React component — call it directly
 * from a parent block's render body (`{glossaryText(item.label, seen)}`),
 * never as `<GlossaryText .../>`. `seen` is mutated as a side effect while
 * walking the text, which is exactly the kind of impure render React 19
 * Strict Mode's double-invocation is designed to catch: if this were its
 * own component, React would call it twice independently per update, and
 * the second call would see `seen` already mutated by the first, treating
 * every term as already-explained and silently dropping every tooltip
 * (confirmed live — every jargon term was reaching the "should render a
 * tooltip" branch per a debug log, yet zero tooltips ever reached the DOM).
 * Calling this as a plain function keeps the mutation scoped to one
 * execution of the parent component's own render body, where the "first
 * occurrence in this block" bookkeeping is supposed to live.
 */
export function glossaryText(text: string, seen: Set<string>): ReactNode {
  const parts = text.split(JARGON_REGEX);
  // String.split with a capturing-group regex interleaves matches into the
  // result: even indices are plain text, odd indices are matched terms.
  return parts.map((part, i) => {
    if (i % 2 === 0) return part ? <span key={i}>{part}</span> : null;
    const term = canonicalTerm(part);
    const entry = term ? getGlossaryEntry(term) : undefined;
    if (!term || !entry || seen.has(term)) return <span key={i}>{part}</span>;
    seen.add(term);
    return (
      <Tooltip key={i}>
        <TooltipTrigger asChild>
          <span className="inline-flex items-center gap-0.5 cursor-default border-b border-dotted border-muted-foreground/50">
            {part}
            <HelpCircle className="h-2.5 w-2.5 text-muted-foreground/70" />
          </span>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          className="max-w-[240px] text-center leading-snug bg-popover text-popover-foreground border border-border shadow-lg"
        >
          <p className="font-medium text-xs mb-1 text-foreground/70">{entry.plainLabel}</p>
          <p className="text-xs">{entry.description}</p>
        </TooltipContent>
      </Tooltip>
    );
  });
}
