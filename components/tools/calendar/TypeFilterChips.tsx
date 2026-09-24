'use client';

import type { ElementType } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, DollarSign, Scissors, Rocket, Landmark } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { EventType } from './types';

interface TypeFilterChipsProps {
  active: Set<EventType>;
  onToggle: (type: EventType) => void;
  economicActive: boolean;
  onToggleEconomic: () => void;
}

export function TypeFilterChips({ active, onToggle, economicActive, onToggleEconomic }: TypeFilterChipsProps) {
  const { t } = useTranslation('tools');
  const TYPES: { key: EventType | 'economic'; label: string; icon: ElementType }[] = [
    { key: 'earnings', label: t('calendarFilterEarnings'), icon: TrendingUp },
    { key: 'dividends', label: t('calendarFilterDividends'), icon: DollarSign },
    { key: 'splits', label: t('calendarFilterSplits'), icon: Scissors },
    { key: 'ipo', label: t('calendarFilterIpos'), icon: Rocket },
    { key: 'economic', label: t('calendarFilterEconomic'), icon: Landmark },
  ];
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {TYPES.map(({ key, label, icon: Icon }) => {
        const isActive = key === 'economic' ? economicActive : active.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => (key === 'economic' ? onToggleEconomic() : onToggle(key))}
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
