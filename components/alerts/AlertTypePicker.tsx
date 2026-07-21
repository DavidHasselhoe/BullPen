'use client';

import { ArrowUp, ArrowDown, TrendingUp, TrendingDown, ChevronsUp, ChevronsDown, Trophy } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ALERT_TYPE_GROUPS, alertTypeLabel, type AlertType } from '@/types/alerts';

/** Shared per-condition icon language — also used by AlertCard for scannable row glyphs. */
export const ALERT_TYPE_ICON: Record<AlertType, React.ComponentType<{ className?: string }>> = {
  price_above:     ArrowUp,
  price_below:     ArrowDown,
  pct_change_up:   TrendingUp,
  pct_change_down: TrendingDown,
  near_52w_high:   ChevronsUp,
  near_52w_low:    ChevronsDown,
  all_time_high:   Trophy,
};

interface Props {
  value: AlertType | null;
  onChange: (t: AlertType) => void;
}

export function AlertTypePicker({ value, onChange }: Props) {
  return (
    <div className="space-y-3">
      {ALERT_TYPE_GROUPS.map(({ group, types }) => (
        <div key={group}>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/50 mb-1.5 px-0.5">
            {group}
          </div>
          <div className={cn('grid gap-2', types.length === 1 ? 'grid-cols-1' : 'grid-cols-2')}>
            {types.map((t) => {
              const Icon = ALERT_TYPE_ICON[t];
              const selected = value === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onChange(t)}
                  className={cn(
                    'flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left transition-all',
                    selected
                      ? 'border-emerald-500/60 bg-emerald-500/[0.06] text-foreground'
                      : 'border-border/50 bg-card/30 text-muted-foreground hover:border-border hover:text-foreground'
                  )}
                  aria-pressed={selected}
                >
                  <Icon
                    className={cn('h-3.5 w-3.5 shrink-0', selected ? 'text-emerald-500' : 'text-muted-foreground/60')}
                  />
                  <span className="text-xs font-medium">{alertTypeLabel(t)}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
