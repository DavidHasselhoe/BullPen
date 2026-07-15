'use client';

import { usePathname } from 'next/navigation';
import { useAIPanel } from './AIPanelProvider';
import { BullAiIcon } from './BullAiIcon';
import { cn } from '@/lib/utils';

// Public marketing/support pages — no app context (tickers, portfolio, etc.) for the
// assistant to act on, so the toggle stays inside the actual dashboard experience.
const PUBLIC_ROUTES = new Set([
  '/',
  '/about',
  '/contact',
  '/roadmap',
  '/changelog',
  '/help',
  '/glossary',
  '/privacy',
  '/disclosures',
  '/security',
  '/login',
  '/register',
]);

export function AIPanelToggle() {
  const { isOpen, toggle } = useAIPanel();
  const pathname = usePathname();

  if (PUBLIC_ROUTES.has(pathname)) return null;

  // Hide when panel is open so it doesn't overlap the input; close via panel X button
  if (isOpen) return null;

  return (
    <button
      onClick={toggle}
      aria-label="Ask Bull — open AI Assistant"
      title="Ask Bull"
      className={cn(
        'fixed bottom-4 right-4 z-50',
        'h-16 pl-2 pr-5 rounded-full shadow-lg shadow-black/25',
        'flex items-center gap-2.5',
        'bg-primary text-primary-foreground',
        'hover:bg-primary/90 active:scale-[0.98]',
        'transition-all duration-200'
      )}
    >
      {/* A solid bg-background badge behind the icon, rather than inverting the
          line art against bg-primary's ink-swapped fill directly — thin strokes
          inverted onto a solid color read as faint/washed out. bg-background
          tracks the same light/dark polarity as the page, so the icon can use
          the standard dark:invert (BullAiIcon's default) and always contrasts
          cleanly against the badge regardless of theme. */}
      <span className="flex items-center justify-center rounded-full bg-background p-2 shrink-0">
        <BullAiIcon pose="glass" size={36} />
      </span>
      <span className="text-base font-semibold hidden sm:inline">Ask Bull</span>
    </button>
  );
}
