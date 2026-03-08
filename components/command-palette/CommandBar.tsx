'use client';

import { useCommandPalette } from './CommandPaletteProvider';
import { Search } from 'lucide-react';

/**
 * Hero command bar - primary action at top of dashboard.
 * Clicking opens the command palette (same as Ctrl+⌘K).
 */
export function CommandBar() {
  const { open } = useCommandPalette();

  return (
    <button
      type="button"
      onClick={open}
      className="group w-full flex items-center gap-3 rounded-xl border-2 border-border bg-card/60 px-5 py-5 text-left transition-all duration-200 hover:border-primary/50 hover:bg-card hover:shadow-md hover:shadow-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2 focus:ring-offset-background focus:shadow-[0_0_0_3px_oklch(0.922_0_0_/_.15)] dark:focus:shadow-[0_0_0_3px_oklch(1_0_0_/_.12)]"
    >
      <Search className="h-5 w-5 shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
      <span className="flex-1 text-base text-muted-foreground group-hover:text-foreground transition-colors">
        Search companies, filings, metrics, or ask BullPen AI
      </span>
      <kbd className="hidden sm:inline-flex h-7 items-center gap-0.5 rounded border bg-muted/80 px-2 text-xs font-medium text-muted-foreground">
        ⌘K / Ctrl+K
      </kbd>
    </button>
  );
}
