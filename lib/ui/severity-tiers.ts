// lib/ui/severity-tiers.ts
//
// The shared severity/status color system (DESIGN.md "The One Signal Rule"):
// neutral (nothing to flag), caution (Warn Amber), risk (Signal Red), info
// (Info Blue, for genuinely low-severity/informational items). No orange, no
// green — green/red are reserved exclusively for literal financial direction
// (gain/loss) elsewhere in the app, never for "how bad is this" severity.
//
// Originated in the Portfolio Risk Analysis feature; shared here so Deep Dive
// and Portfolio Builder draw from the same system instead of inventing their
// own ad hoc severity colors.

export type Tier = 'neutral' | 'info' | 'caution' | 'risk';

/** Generic 0-100 score → tier, for any dimension scored on that scale. */
export function scoreTier(score: number): Tier {
  if (score >= 70) return 'risk';
  if (score >= 45) return 'caution';
  return 'neutral';
}

export function tierTextClass(tier: Tier): string {
  switch (tier) {
    case 'risk':    return 'text-red-400';
    case 'caution': return 'text-amber-400';
    case 'info':    return 'text-blue-400';
    default:        return 'text-foreground';
  }
}

export function tierBarClass(tier: Tier): string {
  switch (tier) {
    case 'risk':    return 'bg-red-500';
    case 'caution': return 'bg-amber-500';
    case 'info':    return 'bg-blue-500';
    default:        return 'bg-muted-foreground/40';
  }
}

export function tierBadgeClass(tier: Tier): string {
  switch (tier) {
    case 'risk':    return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'caution': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'info':    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    default:        return 'bg-muted text-muted-foreground border-border/40';
  }
}
