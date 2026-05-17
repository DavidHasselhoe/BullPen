'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { TOOLS } from '@/lib/tools/tools-config';
import { cn } from '@/lib/utils';

export function ToolShortcutsBar() {
  const available = TOOLS.filter((t) => t.status !== 'coming-soon');

  return (
    <section aria-labelledby="tools-heading" className="mb-10">
      <div className="flex items-end justify-between mb-3">
        <h2 id="tools-heading" className="text-sm font-semibold uppercase tracking-widest text-muted-foreground/60">
          Tools
        </h2>
        <Link
          href="/tools"
          className="text-[11px] uppercase tracking-widest text-muted-foreground/50 hover:text-foreground transition-colors flex items-center gap-1"
        >
          All tools <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Grid on desktop; horizontal scroll on mobile */}
      <div
        className={cn(
          'flex gap-3 overflow-x-auto -mx-4 px-4 pb-2 -mb-2 snap-x snap-mandatory',
          'md:grid md:grid-cols-4 md:overflow-visible md:mx-0 md:px-0 md:pb-0 md:mb-0 md:snap-none',
          'scrollbar-hide',
        )}
      >
        {available.map((tool) => {
          const Icon = tool.icon;
          return (
            <Link
              key={tool.id}
              href={tool.href}
              className={cn(
                'group relative shrink-0 snap-start md:shrink',
                'w-[220px] md:w-auto',
                'rounded-xl border border-border/50 bg-card/40 p-4',
                'hover:border-border hover:bg-card transition-all duration-200',
                'hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              )}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center justify-center h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 group-hover:bg-primary/15 transition-colors">
                  <Icon className="h-4 w-4 text-primary" />
                </div>
                <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/30 group-hover:text-muted-foreground/70 transition-colors" />
              </div>
              <div className="text-sm font-semibold text-foreground leading-tight">{tool.name}</div>
              <p className="text-[11px] text-muted-foreground/55 leading-snug mt-1 line-clamp-2">
                {tool.description}
              </p>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
