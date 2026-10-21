'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface StockNavSection {
  id: string;
  label: string;
}

/**
 * In-page sections (scroll-spy buttons), then links out to the stock's own
 * pages (dividends, congress trades, fund holders), which used to be
 * reachable only from a "More on" block ~4 screens down.
 */
export function StockNavSidebar({ sections, links = [] }: { sections: StockNavSection[]; links?: Array<{ href: string; label: string }> }) {
  const { t } = useTranslation('stock');
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null);

  useEffect(() => {
    if (sections.length === 0) return;

    const lastId = sections[sections.length - 1].id;

    // A short final section can never reach the reading line below: the
    // page runs out of room to scroll first. So once the last section's
    // bottom is on screen, it wins.
    //
    // The "at bottom" check itself is deliberately NOT window.scrollY vs
    // document.documentElement.scrollHeight — this app's shared shell
    // (AIPanelProvider) scrolls an inner flex container, not the window,
    // so those two are permanently 0 and innerHeight here and the check
    // would be true from the very first render. getBoundingClientRect is
    // always viewport-relative regardless of which ancestor actually owns
    // the scrollbar, so checking whether the last section's own bottom
    // edge has scrolled into view works no matter which element scrolls.
    //
    // The section being read is the last one whose top has passed a reading
    // line a quarter of the way down the viewport. This replaced an
    // IntersectionObserver band (12-25% of the viewport) that only updated
    // while some section's box overlapped the band: scrolling through a part
    // of the page the nav doesn't list (Washington activity) left it empty,
    // so the highlight stuck on an earlier section.
    function computeActive() {
      const lastEl = document.getElementById(lastId);
      if (lastEl && lastEl.getBoundingClientRect().bottom <= window.innerHeight + 4) {
        setActiveId(lastId);
        return;
      }
      const line = window.innerHeight * 0.25;
      let current = sections[0].id;
      for (const { id } of sections) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top <= line) current = id;
      }
      setActiveId(current);
    }

    // "scroll" doesn't bubble, so a listener on window in the bubble phase
    // never sees it fire on a nested scrollable ancestor. A capture-phase
    // listener does — this fires for a scroll on window OR any descendant
    // scrollable container, so it works regardless of which one this page
    // actually uses.
    window.addEventListener('scroll', computeActive, { capture: true, passive: true });
    computeActive();

    return () => {
      window.removeEventListener('scroll', computeActive, { capture: true });
    };
  }, [sections]);

  const handleClick = (id: string) => {
    setActiveId(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <nav aria-label={t('pageSectionsAriaLabel')} className="flex flex-col">
      {sections.map(({ id, label }) => {
        const isActive = activeId === id;
        return (
          <button
            key={id}
            onClick={() => handleClick(id)}
            className={cn(
              'group relative text-left text-xs py-1.5 pl-4 pr-2 rounded-r-md transition-colors duration-150',
              isActive
                ? 'text-foreground font-medium'
                : 'text-muted-foreground hover:text-muted-foreground/85'
            )}
          >
            <span
              className={cn(
                'absolute left-0 top-1/2 -translate-y-1/2 w-[2px] rounded-full transition-all duration-200',
                isActive
                  ? 'h-[18px] bg-foreground/60'
                  : 'h-0 group-hover:h-3 group-hover:bg-border'
              )}
            />
            {label}
          </button>
        );
      })}
      {links.length > 0 && (
        <div className="mt-3 border-t border-border/60 pt-3">
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-1 py-1.5 pl-4 pr-2 text-xs text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              {label}
              <ArrowRight className="h-3 w-3 opacity-60 transition-opacity group-hover:opacity-100" aria-hidden />
            </Link>
          ))}
        </div>
      )}
    </nav>
  );
}
