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
        'h-14 px-4 rounded-full shadow-lg shadow-black/25',
        'flex items-center gap-2',
        'bg-primary text-primary-foreground',
        'hover:bg-primary/90 active:scale-[0.98]',
        'transition-all duration-200'
      )}
    >
      {/* bg-primary is an ink-swapped fill (near-black in light mode, near-white
          in dark mode) — the opposite of the page background, so the icon's
          invert needs to run backwards from the usual dark:invert convention. */}
      <BullAiIcon pose="glass" size={22} className="invert dark:invert-0" />
      <span className="text-sm font-medium hidden sm:inline">Ask Bull</span>
    </button>
  );
}
