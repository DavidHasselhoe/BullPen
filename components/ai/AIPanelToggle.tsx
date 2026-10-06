'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { useAIPanel } from './AIPanelProvider';
import { BullAiIcon } from './BullAiIcon';
import { cn } from '@/lib/utils';
import { isStandalonePage } from '@/components/navigation/AuthNavigation';

// Public marketing/support pages have no app context (tickers, portfolio) for
// the assistant to act on. Same list as the app nav, so a new page is added once.

const MEDIA = new Set(['IMG', 'CANVAS', 'VIDEO', 'INPUT', 'TEXTAREA', 'SELECT', 'BUTTON']);

/** Does `el` paint anything at (x, y)? Layout wrappers that are transparent
 *  and borderless don't, which is what the margin beside the content is. */
function paintsAt(el: Element, x: number, y: number, pageBg: string): boolean {
  if (MEDIA.has(el.tagName) || el instanceof SVGElement) return true;
  const s = getComputedStyle(el);
  if (s.backgroundImage !== 'none') return true;
  // Page wrappers repaint the page's own background (bg-background); only a different fill shows.
  if (s.backgroundColor !== pageBg && !/[,/]\s*0\)$|^transparent$/.test(s.backgroundColor)) return true;
  if (parseFloat(s.borderLeftWidth) > 0 && parseFloat(s.borderRightWidth) > 0) return true;
  // A block of text spans the full width; only the glyphs count.
  const range = document.createRange();
  for (const node of el.childNodes) {
    if (node.nodeType !== Node.TEXT_NODE || !node.textContent?.trim()) continue;
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return true;
    }
  }
  return false;
}

/** Is any of the page's content under the button? Probes its corners and centre. */
function coversContent(button: HTMLElement, scroller: HTMLElement): boolean {
  const b = button.getBoundingClientRect();
  const points: [number, number][] = [
    [b.left + 4, b.top + 4], [b.right - 4, b.top + 4], [b.left + b.width / 2, b.top + b.height / 2],
    [b.left + 4, b.bottom - 4], [b.right - 4, b.bottom - 4],
  ];
  const pageBg = getComputedStyle(document.body).backgroundColor;
  return points.some(([x, y]) => {
    for (const el of document.elementsFromPoint(x, y)) {
      if (button.contains(el)) continue;
      if (el === scroller || !scroller.contains(el)) return false;
      if (paintsAt(el, x, y, pageBg)) return true;
    }
    return false;
  });
}

export function AIPanelToggle() {
  const { t } = useTranslation('ai');
  const { isOpen, toggle } = useAIPanel();
  const pathname = usePathname();
  const hiddenForRoute = isStandalonePage(pathname);
  const visible = !hiddenForRoute && !isOpen;

  // Reserve room for the button at the end of the page on phones, the same
  // way MobileTabBar reserves its own (see .has-ask-bull in globals.css).
  // Without it the last ~130px of every page sat underneath the button.
  // DOM side effect, not setState, like MobileTabBar's.
  useEffect(() => {
    if (!visible) return;
    document.body.classList.add('has-ask-bull');
    return () => document.body.classList.remove('has-ask-bull');
  }, [visible]);

  // The button sits exactly where rows keep their numbers and actions (on
  // desktop too: on the stock page it covered "My Holdings", the P/S scale's
  // end label and "See all Washington trading"), so it steps aside while you
  // scroll down and comes back on any scroll up, near the top, or at the end
  // of the page. Keyed by path so a new page always starts with it showing.
  // Only when something is actually under it, though: on a wide screen it
  // sits in the empty margin and hiding it there just made it disappear.
  const [tuckedOn, setTuckedOn] = useState<string | null>(null);
  const tucked = tuckedOn === pathname;
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!visible) return;
    const el = document.querySelector<HTMLElement>('.app-scroll');
    if (!el) return;
    let last = el.scrollTop;
    const onScroll = () => {
      const y = el.scrollTop;
      const atEnd = y + el.clientHeight >= el.scrollHeight - 8;
      if (y < 80 || atEnd || y < last - 6) setTuckedOn(null);
      else if (y > last + 6 && buttonRef.current && coversContent(buttonRef.current, el)) setTuckedOn(pathname);
      last = y;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [visible, pathname]);

  // /share/[id] is dynamic (one per share), same reasoning as the routes
  // above: a stranger landing on a share link has no portfolio/tickers for
  // the assistant to act on, and the whole point of that page is one focused
  // CTA — not a second, unrelated affordance competing for attention.
  // /get-started/trial is part of onboarding, where the toggle covered the trial terms on phones.
  if (hiddenForRoute) return null;

  // Hide when panel is open so it doesn't overlap the input; close via panel X button
  if (isOpen) return null;

  return (
    <button
      ref={buttonRef}
      onClick={toggle}
      aria-hidden={tucked || undefined}
      tabIndex={tucked ? -1 : undefined}
      aria-label={t('panelToggleAriaLabel')}
      title={t('askBull')}
      className={cn(
        'fixed right-4 md:right-5 z-50 group',
        // Below md, MobileTabBar occupies ~3.5rem + safe-area at the bottom
        // (see .has-mobile-tabbar in globals.css) — clear it instead of overlapping.
        'bottom-5 max-md:[bottom:calc(3.5rem+1.25rem+env(safe-area-inset-bottom))]',
        // Phones: one 44px-tall pill, label beside the icon. Stacked, the 64px
        // circle and its label stood ~90px tall over the first screen's content
        // (it covered the Weekly Pick's return on Discover).
        'flex flex-row-reverse items-center gap-1.5 md:flex-col',
        'transition-[transform,opacity] duration-200 ease-out',
        tucked && 'pointer-events-none translate-y-[140%] opacity-0',
        // Home on a phone: at the top of the page the button sat on the third
        // mover's "Why?", where nothing has scrolled yet to tuck it. Home has
        // its own Ask Bull prompts right under those movers, so it steps out.
        pathname === '/dashboard' && 'max-md:hidden',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background rounded-2xl'
      )}
    >
      {/* A single bg-background circle — tracks the same light/dark polarity as
          the page, so the icon can use the standard dark:invert (BullAiIcon's
          default) and always contrasts cleanly. A thin border + shadow give it
          definition against arbitrary page content instead of a heavy filled ring. */}
      <span
        className={cn(
          // 44px on phones (was 64, and 96 before that, a quarter of the screen's width).
          'flex items-center justify-center h-11 w-11 md:h-24 md:w-24 rounded-full shrink-0',
          'bg-background border border-border/60 shadow-lg shadow-black/20',
          'group-hover:border-primary/40 group-hover:shadow-xl group-active:scale-[0.96]',
          'transition-all duration-200'
        )}
      >
        {/* size is an inline style, so the phone size needs an important utility to win */}
        <BullAiIcon pose="glass" size={92} className="max-md:h-[40px]! max-md:w-[40px]!" />
      </span>
      <span
        className={cn(
          'text-xs md:text-sm font-semibold text-foreground px-2 py-0.5 md:px-3 md:py-1 rounded-full',
          'bg-background/90 backdrop-blur-sm border border-border/60 shadow-sm',
          'group-hover:border-primary/30 transition-colors duration-200'
        )}
      >
        {t('askBull')}
      </span>
    </button>
  );
}
