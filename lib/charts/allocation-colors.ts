/**
 * Categorical palette for "part of a whole" charts (sector mix, fund
 * allocation). Lives in lib/ rather than next to one chart so any surface can
 * use it without importing a client component.
 *
 * This is categorical color — identity, not meaning — so it sits outside
 * DESIGN.md's One Signal Rule, which governs emerald/red as gain-loss signal.
 * Nothing here may be used to encode direction.
 */
export const ALLOCATION_COLORS = [
  '#3b82f6', // blue
  '#06b6d4', // cyan
  '#f59e0b', // amber
  '#f43f5e', // rose
  '#10b981', // emerald
  '#a78bfa', // violet
  '#6366f1', // indigo
  '#fbbf24', // yellow
  '#8b5cf6', // purple
  '#94a3b8', // slate
  '#34d399', // teal
];

/** Aggregated "everything else" bucket — deliberately neutral, since it isn't
 *  one real entity competing for identity with the named slices. */
export const ALLOCATION_OTHER_COLOR = 'var(--muted-foreground)';
