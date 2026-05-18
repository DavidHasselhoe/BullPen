'use client';

import { Sparkles } from 'lucide-react';
import { useQuota } from '@/hooks/use-quota';
import { cn } from '@/lib/utils';
import type { QuotaFeature } from '@/lib/billing/quotas';

interface Props {
  feature: QuotaFeature;
  /** Singular/plural label for the unit, e.g. "build"/"builds". */
  unit: { singular: string; plural: string };
  className?: string;
}

function formatResetDate(iso: string, period: 'day' | 'month'): string {
  const d = new Date(iso);
  if (period === 'day') {
    return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

/**
 * Small pill that shows "2 / 3 builds this month · resets Mar 1" for free users.
 * Returns null for pro/admin users (unlimited) and while loading.
 */
export function QuotaIndicator({ feature, unit, className }: Props) {
  const { data } = useQuota(feature);

  if (!data) return null;
  // Pro/admin → unlimited; don't show the pill
  if (data.limit === 'unlimited') return null;

  const { used, limit, period, resetsAt } = data;
  const remaining = Math.max(0, (limit as number) - used);
  const atLimit = remaining === 0;
  const noun = remaining === 1 ? unit.singular : unit.plural;
  const periodLabel = period === 'day' ? 'today' : 'this month';

  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px]',
        atLimit
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-300'
          : 'border-border/60 bg-muted/20 text-muted-foreground',
        className,
      )}
      role="status"
      aria-live="polite"
    >
      <Sparkles className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
      <span className="font-semibold tabular-nums">
        {used} / {limit}
      </span>
      <span>
        {noun} {periodLabel}
      </span>
      <span className="opacity-50">·</span>
      <span className="opacity-70">resets {formatResetDate(resetsAt, period)}</span>
    </div>
  );
}
