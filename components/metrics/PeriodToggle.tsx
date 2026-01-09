'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { PeriodType } from '@/lib/types/database';

interface PeriodToggleProps {
  selected: PeriodType;
  onChange: (period: PeriodType) => void;
}

export function PeriodToggle({ selected, onChange }: PeriodToggleProps) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border bg-card p-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange('annual')}
        className={cn(
          'h-8 px-3',
          selected === 'annual' &&
            'bg-foreground text-background hover:bg-foreground/90'
        )}
      >
        Annual
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange('quarterly')}
        className={cn(
          'h-8 px-3',
          selected === 'quarterly' &&
            'bg-foreground text-background hover:bg-foreground/90'
        )}
      >
        Quarterly
      </Button>
    </div>
  );
}
