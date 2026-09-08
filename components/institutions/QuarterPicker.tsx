'use client';

/**
 * Which quarter's 13F is on screen.
 *
 * A Select rather than a row of pills: the list grows by one every quarter
 * the sync runs, so a control that is comfortable at five entries and still
 * comfortable at twenty is the one worth having.
 *
 * Renders nothing when only one quarter exists. A picker offering a single
 * choice is a control that cannot do anything, and until the historical
 * backfill ran that was every fund.
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

/** "2026-06-30" to "Q2 2026". */
export function quarterLabel(iso: string): string {
  const [year, month] = iso.split('-').map(Number);
  if (!year || !month) return iso;
  return `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
}

interface QuarterPickerProps {
  quarters: string[];
  /** Null means "latest", which is what the page loads with. */
  value: string | null;
  onChange: (quarter: string) => void;
  /** A quarter is being fetched. The previous one stays on screen while it
   *  loads, so this is the only thing saying work is happening. */
  busy?: boolean;
}

export function QuarterPicker({ quarters, value, onChange, busy }: QuarterPickerProps) {
  if (quarters.length < 2) return null;

  const selected = value ?? quarters[0];

  return (
    <div className="flex items-center gap-2">
      <label htmlFor="quarter-picker" className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
        Quarter
      </label>
      <Select value={selected} onValueChange={onChange}>
        <SelectTrigger
          id="quarter-picker"
          size="sm"
          className="w-[140px] font-mono tabular-nums"
          aria-label="Choose which quarter's holdings to show"
        >
          {/* Explicit children: with none, Radix clones the selected item's
              content into the trigger, dragging the "Latest" marker with it. */}
          <SelectValue>{quarterLabel(selected)}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {quarters.map((q, i) => (
            <SelectItem key={q} value={q} className="font-mono tabular-nums">
              {quarterLabel(q)}
              {i === 0 && <span className="ml-2 font-sans text-xs text-muted-foreground">Latest</span>}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {busy && (
        <span className="text-xs text-muted-foreground/70" role="status">
          Loading…
        </span>
      )}
    </div>
  );
}
