'use client';

import type { ReactNode } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { getGlossaryEntry } from '@/lib/finance/glossary';
import { HelpCircle } from 'lucide-react';

// Jargon Deep Dive and Portfolio Builder prose both use without explanation
// (RPO, FCF, EV/EBITDA, TTM/NTM, constant-currency growth, YoY, forward P/E,
// gross/operating margin, EUV, CoWoS, HPC, basis points). Deliberately a
// short curated list, not the full ~150-entry GLOSSARY — sweeping every
// mention of "Revenue" or "Growth" would recreate the wall-of-tooltips
// density problem this component exists to fix. Shared across both report
// types rather than duplicated — none of these terms have a plausible
// false-positive context in either.
const JARGON_TERMS = [
  'EV/EBITDA', 'Forward P/E', 'Fwd P/E', 'Constant Currency', 'Basis Points',
  'Operating Margin', 'Gross Margin', 'CoWoS', 'RPO', 'FCF', 'TTM', 'NTM', 'YoY', 'EUV', 'HPC', 'bps',
  // Added after a live report used all of these with nothing to explain them.
  // 'Beta' and 'P/E' already had glossary entries and simply were never swept.
  // Sorting by length below is what keeps 'P/E' from stealing the match inside
  // 'Forward P/E', so these are safe to add flat.
  'Sequential Growth', 'Hyperscaler', 'TAM', 'Beta', 'P/E',
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

const JARGON_REGEX = new RegExp(`\\b(${JARGON_TERMS.map(termPattern).join('|')})\\b`, 'gi');

// GLOSSARY is keyed by exact casing ("TTM", not "ttm") and a literal space
// ("Constant Currency"), so a lowercase or hyphenated mention in AI-generated
// prose still needs to resolve to the right entry.
function canonicalTerm(matched: string): string | undefined {
  const normalized = matched.toLowerCase().replace(/[\s-]+/g, ' ');
  return JARGON_TERMS.find((t) => t.toLowerCase() === normalized);
}

/**
 * Renders `text` with the first mention of each jargon term (per `seen`)
 * wrapped in a tap/click popover; later mentions render as plain text.
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
      // Popover, not Tooltip. A Radix tooltip opens on hover and focus and
      // never on tap, so on a phone the "?" was decoration: the definition was
      // unreachable for every touch reader, which for a beginner-first product
      // is most of them. A popover opens on click, which a tap satisfies, and
      // keeps keyboard access via a real button.
      <Popover key={i}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`What does ${part} mean?`}
            className="inline-flex items-center gap-0.5 border-b border-dotted border-muted-foreground/50 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          >
            {part}
            <HelpCircle className="h-2.5 w-2.5 text-muted-foreground/70" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent side="top" className="w-[260px] p-3 leading-snug shadow-lg">
          <p className="mb-1 text-xs font-medium text-foreground/70">{entry.plainLabel}</p>
          <p className="text-xs text-popover-foreground">{entry.description}</p>
        </PopoverContent>
      </Popover>
    );
  });
}
