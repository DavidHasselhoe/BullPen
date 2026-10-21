'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';

/**
 * The subpage tab strip. Client only so the current tab is scrolled into view
 * on a phone: at 375px the four labels overflow and "Fund holders" used to
 * show as "Fu" on its own page.
 */
export function SubpageTabs({ label, tabs }: { label: string; tabs: Array<{ href: string; label: string; current: boolean }> }) {
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = nav.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (nav.current && el) nav.current.scrollLeft = el.offsetLeft - (nav.current.clientWidth - el.offsetWidth) / 2;
  }, []);

  return (
    <nav ref={nav} aria-label={label} className="scrollbar-hide mt-4 flex gap-1 overflow-x-auto border-b">
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.current ? 'page' : undefined}
          className={cn(
            '-mb-px inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors',
            tab.current ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
