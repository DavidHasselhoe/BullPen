// components/tools/portfolio-builder/colors.ts
//
// Portfolio-Builder-specific mappings onto the shared severity/status tier
// system (lib/ui/severity-tiers.ts). Bull/Bear case is the one deliberate
// exception that stays on emerald/red directly in BullBearCase.tsx — it's a
// genuine directional financial framing (would help vs hurt returns), not a
// severity judgment, so it earns the same signal-color treatment as a real
// gain/loss figure. Everything else (risk_level, role) is a severity/status
// classification and belongs on the shared tier system instead.

import type { PortfolioHolding } from '@/lib/ai/portfolio-builder/schema';
import type { Tier } from '@/lib/ui/severity-tiers';

/** holding.risk_level / key_risks[].severity: 'LOW' | 'MEDIUM' | 'HIGH'. */
export function riskLevelTier(level: 'LOW' | 'MEDIUM' | 'HIGH'): Tier {
  switch (level) {
    case 'HIGH':   return 'risk';
    case 'MEDIUM': return 'caution';
    default:       return 'neutral';
  }
}

/**
 * Confidence is the inverse of a risk score — high is reassuring, not
 * alarming — so this deliberately does NOT reuse scoreTier()'s thresholds
 * (which point the other way: high score = risk). Low confidence is what
 * deserves the "caution" flag here.
 */
export function confidenceTier(score: number): Tier {
  if (score >= 70) return 'neutral';
  if (score >= 50) return 'caution';
  return 'risk';
}

export const ROLE_LABEL: Record<PortfolioHolding['role'], string> = {
  CORE: 'Core',
  SECONDARY: 'Secondary',
  HEDGE: 'Hedge',
};

/** Not a severity — role is categorical (what job this holding does), so it
 *  stays on its own distinct palette rather than the risk/caution/neutral
 *  scale. None of these are the reserved emerald/red signal colors. */
export const ROLE_BADGE_CLASS: Record<PortfolioHolding['role'], string> = {
  CORE: 'text-primary border-primary/40 bg-primary/10',
  SECONDARY: 'text-foreground/70 border-border bg-muted/40',
  HEDGE: 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10',
};
