'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface StockNavSection {
  id: string;
  label: string;
}

export function StockNavSidebar({ sections }: { sections: StockNavSection[] }) {
  const { t } = useTranslation('stock');
  const [activeId, setActiveId] = useState<string | null>(sections[0]?.id ?? null);
  const intersectingIds = useRef(new Set<string>());

  useEffect(() => {
    if (sections.length === 0) return;

    const lastId = sections[sections.length - 1].id;

    // A short final section can finish scrolling past without ever
    // entering the observer's trigger band below — the page runs out of
    // room to scroll before the section's top reaches it. Both the
    // IntersectionObserver callback and the scroll listener route through
    // this one function (rather than each calling setActiveId
    // independently) so the "at bottom" check is always the last word —
    // two independent setActiveId callers race, and whichever fired most
    // recently wins, which let the observer's own band-based pick clobber
    // the bottom override right back to an earlier section.
    //
    // The "at bottom" check itself is deliberately NOT window.scrollY vs
    // document.documentElement.scrollHeight — this app's shared shell
    // (AIPanelProvider) scrolls an inner flex container, not the window,
    // so those two are permanently 0 and innerHeight here and the check
    // would be true from the very first render. getBoundingClientRect is
    // always viewport-relative regardless of which ancestor actually owns
    // the scrollbar, so checking whether the last section's own bottom
    // edge has scrolled into view works no matter which element scrolls.
    function computeActive() {
      const lastEl = document.getElementById(lastId);
      if (lastEl && lastEl.getBoundingClientRect().bottom <= window.innerHeight + 4) {
        setActiveId(lastId);
        return;
      }
      // Always highlight the topmost visible section in document order
      const first = sections.find((s) => intersectingIds.current.has(s.id));
      if (first) setActiveId(first.id);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            intersectingIds.current.add(entry.target.id);
          } else {
            intersectingIds.current.delete(entry.target.id);
          }
        });
        computeActive();
      },
      { rootMargin: '-12% 0px -75% 0px', threshold: 0 }
    );

    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    // "scroll" doesn't bubble, so a listener on window in the bubble phase
    // never sees it fire on a nested scrollable ancestor. A capture-phase
    // listener does — this fires for a scroll on window OR any descendant
    // scrollable container, so it works regardless of which one this page
    // actually uses.
    window.addEventListener('scroll', computeActive, { capture: true, passive: true });
    computeActive();

    return () => {
      observer.disconnect();
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
                : 'text-muted-foreground/80 hover:text-muted-foreground/85'
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
    </nav>
  );
}
