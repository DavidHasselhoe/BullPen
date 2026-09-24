'use client';

import type { ElementType } from 'react';
import { useTranslation } from 'react-i18next';
import { TrendingUp, DollarSign, Scissors, Rocket, Landmark, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { ECONOMIC_KIND_ORDER } from '@/lib/market-data/calendar-prefs';
import type { EconomicKind } from '@/lib/market-data/economic-kinds';
import { ECONOMIC_ICONS } from './EconomicEvents';
import type { EventType } from './types';

interface TypeFilterChipsProps {
  active: Set<EventType>;
  onToggle: (type: EventType) => void;
  /** Economic releases shown; empty turns the Economic filter off. */
  economicKinds: EconomicKind[];
  onEconomicKindsChange: (kinds: EconomicKind[]) => void;
}

const chipClass = (isActive: boolean) =>
  cn(
    'flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium border transition-all',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    isActive
      ? 'bg-primary text-primary-foreground border-primary'
      : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/20',
  );

export function TypeFilterChips({ active, onToggle, economicKinds, onEconomicKindsChange }: TypeFilterChipsProps) {
  const { t } = useTranslation('tools');
  const TYPES: { key: EventType; label: string; icon: ElementType }[] = [
    { key: 'earnings', label: t('calendarFilterEarnings'), icon: TrendingUp },
    { key: 'dividends', label: t('calendarFilterDividends'), icon: DollarSign },
    { key: 'splits', label: t('calendarFilterSplits'), icon: Scissors },
    { key: 'ipo', label: t('calendarFilterIpos'), icon: Rocket },
  ];
  const selected = new Set(economicKinds);
  const partial = economicKinds.length > 0 && economicKinds.length < ECONOMIC_KIND_ORDER.length;

  const toggleKind = (kind: EconomicKind) =>
    onEconomicKindsChange(ECONOMIC_KIND_ORDER.filter((k) => (k === kind ? !selected.has(k) : selected.has(k))));

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {TYPES.map(({ key, label, icon: Icon }) => {
        const isActive = active.has(key);
        return (
          <button key={key} type="button" onClick={() => onToggle(key)} aria-pressed={isActive} className={chipClass(isActive)}>
            <Icon className="h-3.5 w-3.5" aria-hidden />
            {label}
          </button>
        );
      })}

      {/* A menu rather than an on/off chip: people follow specific releases
          ("just the jobs report"), and the same picks decide which releases notify them. */}
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={chipClass(economicKinds.length > 0)}>
            <Landmark className="h-3.5 w-3.5" aria-hidden />
            {t('calendarFilterEconomic')}
            {partial && (
              <span className="rounded bg-primary-foreground/20 px-1 tabular-nums">
                {economicKinds.length}/{ECONOMIC_KIND_ORDER.length}
              </span>
            )}
            <ChevronDown className="h-3 w-3 opacity-70" aria-hidden />
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-3">
          <p className="text-sm font-semibold text-foreground">{t('calendarEconomicMenuTitle')}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t('calendarEconomicMenuHint')}</p>
          <div className="mt-3 flex flex-col">
            {ECONOMIC_KIND_ORDER.map((kind) => {
              const Icon = ECONOMIC_ICONS[kind];
              return (
                <label
                  key={kind}
                  className="flex min-h-9 cursor-pointer items-center gap-2.5 rounded-md px-1.5 text-sm text-foreground hover:bg-muted/50"
                >
                  <Checkbox checked={selected.has(kind)} onCheckedChange={() => toggleKind(kind)} />
                  <Icon className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                  {t(`economicName_${kind}`)}
                </label>
              );
            })}
          </div>
          <div className="mt-2 flex justify-between border-t border-border/50 pt-2 text-xs font-medium">
            <button
              type="button"
              onClick={() => onEconomicKindsChange([...ECONOMIC_KIND_ORDER])}
              className="rounded px-1.5 py-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('calendarEconomicSelectAll')}
            </button>
            <button
              type="button"
              onClick={() => onEconomicKindsChange([])}
              className="rounded px-1.5 py-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('calendarEconomicClear')}
            </button>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
