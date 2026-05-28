'use client';

import { cn } from '@/lib/utils';
import { LENS_LABELS, type DeepDiveLens } from '@/lib/ai/deep-dive/schema';

const LENS_ORDER: DeepDiveLens[] = ['full', 'bull_bear', 'valuation', 'risk', 'for_me'];

export function LensPicker({
  value,
  onChange,
  disabled,
}: {
  value: DeepDiveLens;
  onChange: (lens: DeepDiveLens) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Analysis lens">
      {LENS_ORDER.map((lens) => (
        <button
          key={lens}
          role="radio"
          aria-checked={value === lens}
          disabled={disabled}
          onClick={() => onChange(lens)}
          className={cn(
            'rounded-full px-3 py-1.5 text-xs font-medium border transition-colors disabled:opacity-50',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === lens
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30',
          )}
        >
          {LENS_LABELS[lens]}
        </button>
      ))}
    </div>
  );
}
