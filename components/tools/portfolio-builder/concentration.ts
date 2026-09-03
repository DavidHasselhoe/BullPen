import type { PortfolioHolding } from '@/lib/ai/portfolio-builder/schema';

// Warn once a single sector clears this share of the portfolio. `sector` is
// free-text, model-authored (no controlled vocabulary, no server-side
// lookup) — the prompt now asks the model to keep sector names consistent
// across holdings so this groupby doesn't undercount ("Semiconductors" vs
// "Semiconductor Equipment" for the same industry), but that's a nudge, not
// a guarantee.
const CONCENTRATION_WARNING_THRESHOLD = 60;

export interface SectorConcentration {
  sector: string;
  pct: number;
}

/** Largest sector by allocation share, or null if holdings don't clear the warning threshold. */
export function topSectorConcentration(holdings: PortfolioHolding[]): SectorConcentration | null {
  const bySector = new Map<string, number>();
  for (const h of holdings) {
    const key = h.sector.trim();
    if (!key) continue;
    bySector.set(key, (bySector.get(key) ?? 0) + h.allocation_pct);
  }

  let top: SectorConcentration | null = null;
  for (const [sector, pct] of bySector) {
    if (!top || pct > top.pct) top = { sector, pct };
  }

  return top && top.pct > CONCENTRATION_WARNING_THRESHOLD ? top : null;
}
