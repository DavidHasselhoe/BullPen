'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/**
 * A labelled Select in the same shape QuarterPicker uses on the fund page.
 *
 * Extracted from InstitutionalHoldingsSection when the Washington Trading
 * section needed the same control row, so the two Discover sections keep one
 * filter idiom rather than drifting into two.
 */
export function ControlSelect({
  id,
  label,
  value,
  onChange,
  options,
  width,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  width: string;
}) {
  const selected = options.find((o) => o.value === value) ?? options[0];
  // On a phone the controls stack one per row. Labels of different lengths
  // left every menu starting at a different x, so below sm the label gets the
  // widest label's width and the menu fills the rest of the row.
  return (
    <div className="flex w-full items-center gap-2 sm:w-auto">
      <label
        htmlFor={id}
        className="min-w-[6.5rem] text-xs font-medium uppercase tracking-wide text-muted-foreground sm:min-w-0"
      >
        {label}
      </label>
      <Select value={selected.value} onValueChange={onChange}>
        <SelectTrigger id={id} size="sm" className={cn('min-w-0 flex-1 sm:flex-none', width)}>
          <SelectValue>{selected.label}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
