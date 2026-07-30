'use client';

import type { ElementType } from 'react';
import { TrendingUp, DollarSign, Scissors, Rocket } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EventType } from './types';

const TYPES: { key: EventType; label: string; icon: ElementType }[] = [
  { key: 'earnings', label: 'Earnings', icon: TrendingUp },
  { key: 'dividends', label: 'Dividends', icon: DollarSign },
  { key: 'splits', label: 'Splits', icon: Scissors },
  { key: 'ipo', label: 'IPOs', icon: Rocket },
];

interface TypeFilterChipsProps {
  active: Set<EventType>;
  onToggle: (type: EventType) => void;
}

export function TypeFilterChips({ active, onToggle }: TypeFilterChipsProps) {
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {TYPES.map(({ key, label, icon: Icon }) => {
        const isActive = active.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => onToggle(key)}
            aria-pressed={isActive}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-all',
              isActive
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20',
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        );
      })}
    </div>
  );
}
