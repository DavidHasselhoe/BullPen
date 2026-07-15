'use client';

import { Eye, EyeOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MARKET_CONTEXT_ITEMS } from '@/lib/dashboard/widgets';

interface Props {
  hidden: string[];
  onChange: (hidden: string[]) => void;
}

/**
 * Visibility-only toggles for the cards inside the "Market Context" widget —
 * no drag reorder (see MARKET_CONTEXT_ITEMS for why order isn't meaningful here).
 */
export function MarketContextVisibilityEditor({ hidden, onChange }: Props) {
  const hiddenSet = new Set(hidden);

  const toggleHidden = (id: string) => {
    const next = new Set(hiddenSet);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  };

  return (
    <div className="space-y-1.5">
      {MARKET_CONTEXT_ITEMS.map((item) => {
        const isHidden = hiddenSet.has(item.id);
        return (
          <div
            key={item.id}
            className={cn(
              'flex items-center gap-3 rounded-md border bg-background px-3 py-2.5',
              isHidden && 'opacity-50'
            )}
          >
            <span className="text-sm flex-1 min-w-0 truncate">{item.label}</span>
            <button
              type="button"
              onClick={() => toggleHidden(item.id)}
              className="text-muted-foreground/60 hover:text-foreground transition-colors shrink-0 p-1 -m-1 rounded"
              aria-label={isHidden ? `Show ${item.label}` : `Hide ${item.label}`}
              title={isHidden ? `Show ${item.label}` : `Hide ${item.label}`}
            >
              {isHidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        );
      })}
    </div>
  );
}
