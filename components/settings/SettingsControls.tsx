'use client';

import { useId, useRef } from 'react';
import { Check } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Row grammar shared by the Settings and Profile modals, so a switch, a card of
 * switches and a one-of-three choice look and behave the same in both.
 */

/**
 * A label + description + switch row. The whole text is the switch's <label>,
 * so tapping "Big price moves" flips it: the 18px switch on its own was too
 * small a target on a phone.
 */
export function ToggleSetting({
  label, description, checked, onCheckedChange, disabled, badge,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  badge?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex min-h-14 items-center justify-between gap-4 py-3', disabled && 'opacity-60')}>
      <label htmlFor={id} className={cn('min-w-0 flex-1 space-y-0.5', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
        <span className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{label}</span>
          {badge && <Badge variant="secondary" className="h-5 px-1.5 text-xs font-medium">{badge}</Badge>}
        </span>
        {description && (
          <span className="block text-xs leading-snug text-muted-foreground">{description}</span>
        )}
      </label>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} className="shrink-0" />
    </div>
  );
}

/** Groups related rows into a single bordered card with hairline dividers. */
export function SettingsCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border bg-card/30 px-4 divide-y divide-border/50', className)}>
      {children}
    </div>
  );
}

/** A labelled block: heading, optional hint, then its control. */
export function SettingsGroup({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {hint && <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * One-of-three choice as cards. A radiogroup, so a screen reader hears which
 * one is selected and arrow keys move between them. One column on phones:
 * three side by side clipped "Aggressive" and "Detailed" at 390px.
 */
export function SegmentedChoice<T extends string>({
  label, value, options, onChange,
}: {
  label: string;
  value: T | null;
  options: ReadonlyArray<{ value: T; label: string; description: string }>;
  onChange: (value: T) => void;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((o) => o.value === value);

  const onKeyDown = (e: React.KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (i + step + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  };

  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => { refs.current[i] = el; }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected || (selectedIndex === -1 && i === 0) ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={cn(
              'flex min-h-11 flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background',
              selected
                ? 'border-primary bg-primary/10 text-foreground'
                : 'border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground'
            )}
          >
            <span className="flex items-center justify-between gap-2 font-medium">
              {o.label}
              {selected && <Check className="h-3.5 w-3.5 shrink-0" aria-hidden />}
            </span>
            <span className="text-xs text-muted-foreground">{o.description}</span>
          </button>
        );
      })}
    </div>
  );
}
