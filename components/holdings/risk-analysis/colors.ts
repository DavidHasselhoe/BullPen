// components/holdings/risk-analysis/colors.ts
//
// The one severity/color mapping for the whole feature. Collapses the old
// 4-5 tier green/amber/orange/red scale to the 3 tiers BullPen's palette
// actually has (DESIGN.md "The One Signal Rule"): neutral (nothing to flag),
// caution (Warn Amber), risk (Signal Red) — plus 'info' for genuinely
// low-severity/informational items (Info Blue), which is what that token is
// for. No orange anywhere; it isn't part of the system.

export type RiskTier = 'neutral' | 'info' | 'caution' | 'risk';

/** Risk-dimension score (0-100) and the overall score share the same bands. */
export function scoreTier(score: number): RiskTier {
  if (score >= 70) return 'risk';
  if (score >= 45) return 'caution';
  return 'neutral';
}

/** riskLevel: 'Low' | 'Moderate' | 'Elevated' | 'High' | 'Very High' (route.ts:62 thresholds). */
export function levelTier(level: string): RiskTier {
  switch (level) {
    case 'High':
    case 'Very High':
      return 'risk';
    case 'Elevated':
      return 'caution';
    default:
      return 'neutral';
  }
}

/** topRisks[].severity: 'critical' | 'high' | 'medium' | 'low' (route.ts:48). */
export function topRiskTier(severity: string): RiskTier {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'risk';
    case 'medium':
      return 'caution';
    default:
      return 'info';
  }
}

/** stressScenarios[].severity: 'low' | 'medium' | 'high' (route.ts:54). */
export function scenarioTier(severity: string): RiskTier {
  switch (severity) {
    case 'high':
      return 'risk';
    case 'medium':
      return 'caution';
    default:
      return 'info';
  }
}

export function tierTextClass(tier: RiskTier): string {
  switch (tier) {
    case 'risk':    return 'text-red-400';
    case 'caution': return 'text-amber-400';
    case 'info':    return 'text-blue-400';
    default:        return 'text-foreground';
  }
}

export function tierBarClass(tier: RiskTier): string {
  switch (tier) {
    case 'risk':    return 'bg-red-500';
    case 'caution': return 'bg-amber-500';
    case 'info':    return 'bg-blue-500';
    default:        return 'bg-muted-foreground/40';
  }
}

export function tierBadgeClass(tier: RiskTier): string {
  switch (tier) {
    case 'risk':    return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'caution': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'info':    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    default:        return 'bg-muted text-muted-foreground border-border/40';
  }
}

/**
 * Pulls a leading drawdown figure ("-30% to -45%") out of a stress scenario's
 * estimatedImpact prose so it reads as a scannable stat; the remainder is the
 * description. Moved from the old StressScenarioList unchanged.
 */
export function splitImpact(impact: string): { figure: string | null; rest: string } {
  const m = impact.match(
    /^\s*-?\d+(?:\.\d+)?%\s*(?:to|–|—|-)\s*-?\d+(?:\.\d+)?%|^\s*[-−]?\d+(?:\.\d+)?%/i
  );
  if (!m) return { figure: null, rest: impact.trim() };
  const figure = m[0].trim();
  const rest = impact.slice(m[0].length).replace(/^[\s.,—–-]+/, '').trim();
  return { figure, rest };
}

/** Parses the larger-magnitude percentage out of a drawdown figure string, for ranking scenarios by severity. Returns 0 if unparseable. */
export function drawdownMagnitude(impact: string): number {
  const matches = impact.match(/-?\d+(?:\.\d+)?%/g);
  if (!matches) return 0;
  return Math.max(...matches.map((m) => Math.abs(parseFloat(m))));
}
