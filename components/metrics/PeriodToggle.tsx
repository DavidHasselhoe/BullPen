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
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange('annual')}
        className={cn(
          'h-8 px-3 text-foreground',
          selected === 'annual' &&
            'bg-primary text-primary-foreground hover:bg-primary/90'
        )}
      >
        Annual
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange('quarterly')}
        className={cn(
          'h-8 px-3 text-foreground',
          selected === 'quarterly' &&
            'bg-primary text-primary-foreground hover:bg-primary/90'
        )}
      >
        Quarterly
      </Button>
    </div>
  );
}
