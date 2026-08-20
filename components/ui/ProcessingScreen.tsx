'use client';

import { useEffect, useRef, useState } from 'react';
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
   * whole screen changing in the same instant. Callers should keep
   * rendering this component with complete=true for ~1.6s after the real
   * result arrives rather than unmounting it immediately — long enough for
   * the user to actually register the "done" state before the screen swaps.
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
   * Shows "Feel free to leave this page. We'll notify you when it's ready."
   * Only for features backed by a real background job the user can safely
   * navigate away from (poll-and-resume) — not for a synchronous wait like
   * Compare's, which the user should just stay on.
   */
  leavePageHint?: boolean;
}

/**
 * Real progress (items done / phase index) only ever moves in a few big,
 * infrequent steps — jumping the bar straight between those values reads as
 * broken ("is this stuck?"), and a single phase can legitimately run
 * 30-90s (extended thinking) with zero real signal in between. This
 * simulates continuous motion on top of the real signal: within the current
 * band [bandStart, bandEnd), the ceiling itself creeps forward with elapsed
 * time (not just distance), asymptotically approaching but never reaching
 * bandEnd — so the bar stays visibly alive no matter how long a single band
 * lasts, without ever claiming to be further along than the real signal
 * allows. A real band change (the next item/phase) snaps the clock and
 * lets the bar jump forward again. `complete` overrides everything to 100.
 */
function useSimulatedPercent(bandStart: number, bandEnd: number, complete: boolean): number {
  const [display, setDisplay] = useState(1);
  // null until the first effect run sets it — avoids calling the impure
  // Date.now() during render (useRef's initial-value argument still runs
  // on every render even though only the first call is kept).
  const bandStartedAtRef = useRef<number | null>(null);
  const prevBandStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevBandStartRef.current !== bandStart) {
      prevBandStartRef.current = bandStart;
      bandStartedAtRef.current = Date.now();
    }
  }, [bandStart]);

  useEffect(() => {
    const id = setInterval(() => {
      setDisplay((d) => {
        if (complete) {
          if (d >= 100) return d;
          return Math.min(d + Math.max((100 - d) * 0.12, 3), 100);
        }
        const elapsedSec = (Date.now() - (bandStartedAtRef.current ?? Date.now())) / 1000;
        const eased = 1 - Math.exp(-elapsedSec / 12); // ~63% of the way in 12s, ~95% by 36s
        const target = Math.max(d, bandStart + (bandEnd - bandStart) * 0.95 * eased);
        if (d >= target) return d;
        return Math.min(d + Math.max((target - d) * 0.15, 0.15), target);
      });
    }, 200);
    return () => clearInterval(id);
  }, [complete, bandStart, bandEnd]);

  return Math.round(Math.max(1, display));
}

export function ProcessingScreen({
  items,
  itemNoun = { singular: 'item', plural: 'items' },
  phase,
  complete = false,
  completeMessage = 'All set!',
  subtext,
  leavePageHint = false,
}: Props) {
  let bandStart: number;
  let bandEnd: number;
  let message: string;
  let itemCountLine: string | null = null;

  if (items) {
    const total = items.length;
    const doneCount = items.filter((i) => i.done).length;
    const pending = items.filter((i) => !i.done);
    // Item loading only fills 0-92%. Once every item is in but `complete`
    // hasn't fired yet (e.g. risk analysis's server-side pass after all
    // holdings are fetched), bandStart/bandEnd would otherwise both land on
    // 100 with zero room between them — the bar has nowhere left to creep
    // and just sits at 100% for however long that trailing work takes. The
    // reserved 92-99 band keeps it visibly moving through that wait; `complete`
    // still overrides everything to the true 100 when the real result lands.
    const loadCeiling = 92;
    if (pending.length === 0) {
      bandStart = loadCeiling;
      bandEnd = 99;
    } else {
      bandStart = total > 0 ? (doneCount / total) * loadCeiling : 0;
      bandEnd = total > 0 ? ((doneCount + 1) / total) * loadCeiling : loadCeiling;
    }
    message = complete
      ? completeMessage
      : pending.length === 0
        ? 'Finishing up…'
        : pending.length === 1
          ? `Fetching data for ${pending[0].label}…`
          : `Fetching data for ${pending.length} ${itemNoun.plural}…`;
    itemCountLine = complete ? null : `${doneCount} of ${total} ${total === 1 ? itemNoun.singular : itemNoun.plural} loaded.`;
  } else if (phase) {
    bandStart = phase.total > 0 ? (phase.index / phase.total) * 100 : 0;
    bandEnd = phase.total > 0 ? ((phase.index + 1) / phase.total) * 100 : 100;
    message = complete ? completeMessage : phase.label;
  } else {
    bandStart = 0;
    bandEnd = 100;
    message = complete ? completeMessage : 'Working…';
  }

  const percent = useSimulatedPercent(bandStart, bandEnd, complete);

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
          Feel free to leave this page. We&apos;ll notify you when it&apos;s ready.
        </p>
      )}
    </div>
  );
}
