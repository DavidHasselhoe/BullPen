'use client';

import { BullAiIcon } from '@/components/ai/BullAiIcon';
import { Progress } from '@/components/ui/progress';

export interface ProgressItem {
  label: string;
  done: boolean;
}

interface CompareLoadingStateProps {
  items: ProgressItem[];
}

/**
 * Real-progress loading state — replaces a plain skeleton with the bull
 * mascot, a progress bar driven by actual per-company completion (not a
 * simulated timer), and a message naming whichever company is still
 * in flight. Piloted here on Compare; shaped generically (label/done pairs)
 * so it's a prop change, not a rewrite, to reuse on another multi-item page.
 */
export function CompareLoadingState({ items }: CompareLoadingStateProps) {
  const total = items.length;
  const doneCount = items.filter((i) => i.done).length;
  const pending = items.filter((i) => !i.done);
  const percent = total > 0 ? Math.round((doneCount / total) * 100) : 0;

  const pendingMessage =
    pending.length === 0
      ? 'Finishing up…'
      : pending.length === 1
        ? `Fetching data for ${pending[0].label}…`
        : `Fetching data for ${pending.length} companies…`;

  return (
    <div className="flex flex-col items-center gap-6 py-16 text-center">
      <div className="animate-pulse motion-reduce:animate-none">
        <BullAiIcon pose="think" size={96} />
      </div>
      <div className="space-y-1.5">
        <p className="text-base font-medium text-foreground">{pendingMessage}</p>
        <p className="text-sm text-muted-foreground">
          {doneCount} of {total} companies loaded. This can take up to 20 seconds for companies we haven&apos;t cached yet.
        </p>
      </div>
      <div className="w-full max-w-xs space-y-1.5">
        <Progress value={percent} className="h-2" />
        <p className="text-xs text-muted-foreground tabular-nums">{percent}%</p>
      </div>
    </div>
  );
}
