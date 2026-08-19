// components/holdings/risk-analysis/colors.ts
//
// Risk-Analysis-specific mappings onto the shared severity/status tier system
// (lib/ui/severity-tiers.ts) — the underlying colors/tokens live there now,
// shared with Deep Dive and Portfolio Builder; this file keeps only the
// mappings from this feature's own data shapes onto that shared system.

export type { Tier as RiskTier } from '@/lib/ui/severity-tiers';
export { scoreTier, tierTextClass, tierBarClass, tierBadgeClass } from '@/lib/ui/severity-tiers';

import type { Tier as RiskTier } from '@/lib/ui/severity-tiers';

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
