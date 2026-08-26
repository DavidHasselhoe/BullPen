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

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            intersectingIds.current.add(entry.target.id);
          } else {
            intersectingIds.current.delete(entry.target.id);
          }
        });
        // Always highlight the topmost visible section in document order
        const first = sections.find((s) => intersectingIds.current.has(s.id));
        if (first) setActiveId(first.id);
      },
      { rootMargin: '-12% 0px -75% 0px', threshold: 0 }
    );

    sections.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
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
