'use client';

import type { PortfolioHolding } from '@/lib/ai/portfolio-builder/schema';
import { cn } from '@/lib/utils';

// Reuses the SECTOR_COLORS palette spirit from HoldingsPieChart — tuned for dark UI and
// distinguishable across 12 holdings.
const HOLDING_COLORS = [
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#10b981', // emerald
  '#f59e0b', // amber
  '#a78bfa', // violet
  '#f43f5e', // rose
  '#34d399', // teal
  '#fbbf24', // yellow
  '#6366f1', // indigo
  '#ec4899', // pink
  '#94a3b8', // slate
  '#8b5cf6', // purple
];

const ROLE_ORDER: Record<PortfolioHolding['role'], number> = {
  CORE: 0,
  SECONDARY: 1,
  HEDGE: 2,
};

const ROLE_LABEL: Record<PortfolioHolding['role'], string> = {
  CORE: 'Core',
  SECONDARY: 'Secondary',
  HEDGE: 'Hedge',
};

interface Props {
  holdings: PortfolioHolding[];
}

export function AllocationBars({ holdings }: Props) {
  // Group by role, then sort within each group by allocation desc
  const grouped = holdings
    .slice()
    .sort((a, b) => {
      const roleDiff = ROLE_ORDER[a.role] - ROLE_ORDER[b.role];
      if (roleDiff !== 0) return roleDiff;
      return b.allocation_pct - a.allocation_pct;
    });

  // Assign a stable color per ticker (color index = position in sorted list)
  const colorMap = new Map<string, string>();
  grouped.forEach((h, i) => {
    colorMap.set(h.ticker, HOLDING_COLORS[i % HOLDING_COLORS.length]);
  });

  // Build role-grouped sections for labels
  const sections: { role: PortfolioHolding['role']; items: PortfolioHolding[] }[] = [];
  for (const h of grouped) {
    const last = sections[sections.length - 1];
    if (last && last.role === h.role) last.items.push(h);
    else sections.push({ role: h.role, items: [h] });
  }

  return (
    <div className="space-y-5">
      {sections.map((section) => {
        const sectionTotal = section.items.reduce((sum, h) => sum + h.allocation_pct, 0);
        return (
          <div key={section.role}>
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground/80 font-semibold">
                {ROLE_LABEL[section.role]} · {section.items.length} {section.items.length === 1 ? 'position' : 'positions'}
              </span>
              <span className="text-[11px] tabular-nums text-muted-foreground/80 font-semibold">
                {sectionTotal}%
              </span>
            </div>
            <div className="space-y-2.5">
              {section.items.map((h) => (
                <div key={h.ticker}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: colorMap.get(h.ticker) }}
                      />
                      <span className="font-mono text-xs font-bold text-foreground">{h.ticker}</span>
                      <span className="text-xs text-muted-foreground/80 truncate">{h.company}</span>
                    </div>
                    <span className="text-xs font-semibold tabular-nums text-foreground shrink-0 ml-3">
                      {h.allocation_pct}%
                    </span>
                  </div>
                  <div className={cn('h-1.5 w-full rounded-full bg-muted/60 overflow-hidden')}>
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${h.allocation_pct}%`,
                        backgroundColor: colorMap.get(h.ticker),
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
