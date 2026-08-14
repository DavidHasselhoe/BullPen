'use client';

import { Progress } from '@/components/ui/progress';
import { POSE_SRC } from '@/components/ui/EmptyState';

export interface ProgressItem {
  label: string;
  done: boolean;
}

interface CompareLoadingStateProps {
  items: ProgressItem[];
  /**
   * True during the brief hold after every item has actually finished, right
   * before the parent swaps this out for the real content — gives the user
   * a moment to register "done" instead of the bar hitting 100% and the
   * whole screen changing in the same instant.
   */
  complete?: boolean;
}

/**
 * Real-progress loading state — replaces a plain skeleton with the bull
 * mascot, a progress bar driven by actual per-company completion (not a
 * simulated timer), and a message naming whichever company is still
 * in flight. Piloted here on Compare; shaped generically (label/done pairs)
 * so it's a prop change, not a rewrite, to reuse on another multi-item page.
 */
export function CompareLoadingState({ items, complete = false }: CompareLoadingStateProps) {
  const total = items.length;
  const doneCount = items.filter((i) => i.done).length;
  const pending = items.filter((i) => !i.done);
  const percent = complete ? 100 : total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const message = complete
    ? 'All set!'
    : pending.length === 0
      ? 'Finishing up…'
      : pending.length === 1
        ? `Fetching data for ${pending[0].label}…`
        : `Fetching data for ${pending.length} companies…`;

  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={POSE_SRC[complete ? 'celebrate' : 'thinking']}
        alt=""
        aria-hidden
        style={{ width: 176 }}
        className="h-auto select-none opacity-90 dark:opacity-80 dark:invert"
      />
      <div className="space-y-1.5">
        <p className="text-base font-medium text-foreground">{message}</p>
        {!complete && (
          <p className="text-sm text-muted-foreground">
            {doneCount} of {total} companies loaded. This can take up to 20 seconds for companies we haven&apos;t cached yet.
          </p>
        )}
      </div>
      <div className="w-full max-w-xs space-y-1.5">
        <Progress value={percent} className="h-2" />
        <p className="text-xs text-muted-foreground tabular-nums">{percent}%</p>
      </div>
    </div>
  );
}
