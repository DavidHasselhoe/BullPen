'use client';

import { Progress } from '@/components/ui/progress';
import { POSE_SRC } from '@/components/ui/EmptyState';

export interface ProcessingItem {
  label: string;
  done: boolean;
}

export interface ProcessingPhase {
  /** 0-based index of the current phase. */
  index: number;
  /** Total number of phases. */
  total: number;
  /** What the headline message says while this phase is active. */
  label: string;
}

interface Props {
  /**
   * Parallel-item mode: N independent things each either done or not (e.g.
   * Compare's per-company fetches). Progress = doneCount / total, and the
   * message names whichever items are still in flight.
   */
  items?: ProcessingItem[];
  /** Noun used in items-mode messaging. Default: item/items. */
  itemNoun?: { singular: string; plural: string };
  /**
   * Single-pipeline mode: one job moving through sequential, server-reported
   * phases (e.g. Deep Dive's reading_data -> searching -> reasoning ->
   * composing). Progress = index / total, and the message is the current
   * phase's label directly — no rotating sub-hints, so every processing
   * screen in the app reads identically.
   */
  phase?: ProcessingPhase;
  /**
   * True during the brief hold after the work has actually finished, right
   * before the parent swaps this out for the real content — gives the user
   * a moment to register "done" instead of the bar hitting 100% and the
   * whole screen changing in the same instant.
   */
  complete?: boolean;
  /** Headline shown once `complete` is true. Default: "All set!" */
  completeMessage?: string;
  /**
   * Secondary line under the headline — feature-specific context (e.g.
   * "Running 6-dimension risk assessment", "This can take up to 20 seconds
   * for companies we haven't cached yet"). In items mode this renders
   * *below* the auto-generated "X of Y {noun} loaded" count, not instead
   * of it.
   */
  subtext?: string;
  /**
   * Shows "Feel free to leave this page — we'll notify you when it's ready."
   * Only for features backed by a real background job the user can safely
   * navigate away from (poll-and-resume) — not for a synchronous wait like
   * Compare's, which the user should just stay on.
   */
  leavePageHint?: boolean;
}

/**
 * The one processing/loading screen for every AI-generation feature in the
 * app — piloted on Compare, then generalized here so Risk Analysis,
 * Portfolio Builder, and Deep Dive (previously each with their own bespoke
 * animation) share identical chrome: mascot, one message, a progress bar,
 * and (where relevant) the leave-this-page reassurance. Deliberately
 * minimal — no rotating hints, elapsed timers, or decorative flourishes,
 * so it reads as one calm, recognizable pattern everywhere it appears.
 */
export function ProcessingScreen({
  items,
  itemNoun = { singular: 'item', plural: 'items' },
  phase,
  complete = false,
  completeMessage = 'All set!',
  subtext,
  leavePageHint = false,
}: Props) {
  let percent: number;
  let message: string;
  let itemCountLine: string | null = null;

  if (items) {
    const total = items.length;
    const doneCount = items.filter((i) => i.done).length;
    const pending = items.filter((i) => !i.done);
    percent = complete ? 100 : total > 0 ? Math.round((doneCount / total) * 100) : 0;
    message = complete
      ? completeMessage
      : pending.length === 0
        ? 'Finishing up…'
        : pending.length === 1
          ? `Fetching data for ${pending[0].label}…`
          : `Fetching data for ${pending.length} ${itemNoun.plural}…`;
    itemCountLine = complete ? null : `${doneCount} of ${total} ${total === 1 ? itemNoun.singular : itemNoun.plural} loaded.`;
  } else if (phase) {
    percent = complete ? 100 : phase.total > 0 ? Math.round((phase.index / phase.total) * 100) : 0;
    message = complete ? completeMessage : phase.label;
  } else {
    percent = complete ? 100 : 0;
    message = complete ? completeMessage : 'Working…';
  }

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
        {!complete && (itemCountLine || subtext) && (
          <p className="text-sm text-muted-foreground">
            {itemCountLine}
            {itemCountLine && subtext && ' '}
            {subtext}
          </p>
        )}
      </div>
      <div className="w-full max-w-xs space-y-1.5">
        <Progress value={percent} className="h-2" />
        <p className="text-xs text-muted-foreground tabular-nums">{percent}%</p>
      </div>
      {!complete && leavePageHint && (
        <p className="text-[11px] text-muted-foreground/85 max-w-xs">
          Feel free to leave this page — we&apos;ll notify you when it&apos;s ready.
        </p>
      )}
    </div>
  );
}
