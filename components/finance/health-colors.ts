/**
 * Health-score band/grade color logic, shared by HealthBloom.
 *
 * HealthRing.tsx keeps its own private copy of these same thresholds
 * (untouched intentionally) — this file is the canonical copy for anything
 * new. If HealthRing is ever edited for another reason, switch it to import
 * from here instead of keeping two copies in sync by hand.
 */

import type { HealthGrade } from '@/lib/finance/health-score';

export type { HealthGrade };

export const EMERALD = '#10b981';
export const AMBER = '#fbbf24';
export const RED = '#ef4444';
export const TRACK = 'rgba(148, 163, 184, 0.18)';

export function bandColor(ratio: number): string {
  if (ratio >= 0.7) return EMERALD;
  if (ratio >= 0.45) return AMBER;
  return RED;
}

export function gradeColor(grade: HealthGrade): string {
  if (grade === 'A' || grade === 'B') return EMERALD;
  if (grade === 'C') return AMBER;
  return RED;
}
