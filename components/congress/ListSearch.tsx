'use client';

import { Search, X } from 'lucide-react';

/**
 * Inline filter box for a list that is already on screen.
 *
 * Deliberately not the app's symbol search: nothing here queries the
 * catalogue or leaves the page. It narrows rows the reader is already looking
 * at, which is why it carries no dropdown, no suggestions and no debounce.
 */
export function ListSearch({
  id,
  value,
  onChange,
  placeholder,
  label,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** Screen-reader name. The magnifier alone names nothing. */
  label: string;
}) {
  return (
    <div className="flex h-8 items-center gap-2 rounded-md border border-border/60 bg-transparent px-2.5 transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 sm:w-[220px]">
      <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/85" aria-hidden />
      <input
        id={id}
        type="search"
        value={value}
        aria-label={label}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && value) {
            e.preventDefault();
            onChange('');
          }
        }}
        placeholder={placeholder}
        /* The UA search affordance is unstyleable and duplicates the clear
           button below, so it is suppressed rather than left to render a
           second control in a font nobody chose. */
        className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="shrink-0 rounded-sm text-muted-foreground/80 transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
