'use client';

import { HelpCircle } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { getGlossaryEntry } from '@/lib/finance/glossary';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import { cn } from '@/lib/utils';

interface TermTooltipProps {
  /** The technical/pro label (e.g. "P/E (TTM)") — used as the glossary key */
  term: string;
  /** Optional class on the wrapper span */
  className?: string;
}

/**
 * Renders a financial term label with an adaptive tooltip:
 * - Simple mode: shows the plain-language label from the glossary + tooltip with explanation
 * - Pro mode: shows the original technical term + a subtle ? icon with tooltip on hover
 *
 * Falls back to displaying the original term if no glossary entry exists.
 */
export function TermTooltip({ term, className }: TermTooltipProps) {
  const { isSimplified } = useExperienceLevel();
  const entry = getGlossaryEntry(term);

  const displayLabel = isSimplified && entry ? entry.plainLabel : term;
  const hasTooltip = !!entry;

  if (!hasTooltip) {
    return <span className={className}>{displayLabel}</span>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex items-center gap-1 cursor-default group',
            className
          )}
        >
          {displayLabel}
          <HelpCircle
            className={cn(
              'h-3 w-3 text-muted-foreground/50 shrink-0 transition-opacity',
              isSimplified
                ? 'opacity-70 group-hover:opacity-100'
                : 'opacity-0 group-hover:opacity-60'
            )}
          />
        </span>
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="max-w-[240px] text-center leading-snug bg-popover text-popover-foreground border border-border shadow-lg"
      >
        {!isSimplified && entry && (
          <p className="font-medium text-xs mb-1 text-foreground/70">{entry.plainLabel}</p>
        )}
        <p className="text-xs">{entry.description}</p>
      </TooltipContent>
    </Tooltip>
  );
}
