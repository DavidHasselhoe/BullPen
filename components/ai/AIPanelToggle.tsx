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
  '/terms',
  '/cookies',
  '/accessibility',
  '/disclosures',
  '/security',
  '/login',
  '/register',
  '/get-started',
]);

export function AIPanelToggle() {
  const { isOpen, toggle } = useAIPanel();
  const pathname = usePathname();

  // /share/[id] is dynamic (one per share), same reasoning as the routes
  // above: a stranger landing on a share link has no portfolio/tickers for
  // the assistant to act on, and the whole point of that page is one focused
  // CTA — not a second, unrelated affordance competing for attention.
  if (PUBLIC_ROUTES.has(pathname) || pathname.startsWith('/share/')) return null;

  // Hide when panel is open so it doesn't overlap the input; close via panel X button
  if (isOpen) return null;

  return (
    <button
      onClick={toggle}
      aria-label="Ask Bull: open AI Assistant"
      title="Ask Bull"
      className={cn(
        'fixed right-5 z-50 group',
        // Below md, MobileTabBar occupies ~3.5rem + safe-area at the bottom
        // (see .has-mobile-tabbar in globals.css) — clear it instead of overlapping.
        'bottom-5 max-md:[bottom:calc(3.5rem+1.25rem+env(safe-area-inset-bottom))]',
        'flex flex-col items-center gap-1.5',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-2xl'
      )}
    >
      {/* A single bg-background circle — tracks the same light/dark polarity as
          the page, so the icon can use the standard dark:invert (BullAiIcon's
          default) and always contrasts cleanly. A thin border + shadow give it
          definition against arbitrary page content instead of a heavy filled ring. */}
      <span
        className={cn(
          'flex items-center justify-center h-24 w-24 rounded-full shrink-0',
          'bg-background border border-border/60 shadow-lg shadow-black/20',
          'group-hover:border-primary/40 group-hover:shadow-xl group-active:scale-[0.96]',
          'transition-all duration-200'
        )}
      >
        <BullAiIcon pose="glass" size={72} />
      </span>
      <span
        className={cn(
          'text-sm font-semibold text-foreground px-3 py-1 rounded-full',
          'bg-background/90 backdrop-blur-sm border border-border/60 shadow-sm',
          'group-hover:border-primary/30 transition-colors duration-200'
        )}
      >
        Ask Bull
      </span>
    </button>
  );
}
