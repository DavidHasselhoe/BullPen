'use client';

import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export type Ownership = 'all' | 'owned' | 'watching';

/** Keeps the stocks matching `ownership`; `held` is the owned set, everything else is watched. */
export function byOwnership<T>(items: T[], ownership: Ownership, isHeld: (item: T) => boolean): T[] {
  return ownership === 'all' ? items : items.filter((i) => isHeld(i) === (ownership === 'owned'));
}

/**
 * All / Owned / Watching over a "your stocks" panel (Washington Trading, fund
 * moves). Only worth showing when the list has both kinds: the caller checks.
 */
export function OwnershipFilter({ value, onChange }: { value: Ownership; onChange: (v: Ownership) => void }) {
  const { t } = useTranslation('discover');
  const options: { v: Ownership; label: string }[] = [
    { v: 'all', label: t('overlapFilterAll') },
    { v: 'owned', label: t('congOverlapOwned') },
    { v: 'watching', label: t('congOverlapWatching') },
  ];
  return (
    <div role="group" aria-label={t('overlapFilterLabel')} className="inline-flex shrink-0 rounded-lg border border-border p-0.5">
      {options.map((o) => (
        <button
          key={o.v}
          type="button"
          aria-pressed={value === o.v}
          onClick={() => onChange(o.v)}
          className={cn(
            'min-h-10 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8',
            value === o.v ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
