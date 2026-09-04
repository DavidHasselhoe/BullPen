import { catLabel, type CategoryScore, type HealthGrade } from '@/lib/finance/health-score';

const CATEGORY_ORDER = ['Profitability', 'Financial Strength', 'Valuation', 'Growth', 'Market Risk'] as const;
const CATEGORY_MAX: Record<string, number> = {
  'Profitability': 30,
  'Financial Strength': 25,
  'Valuation': 20,
  'Growth': 15,
  'Market Risk': 10,
};

export interface TickerHealth {
  score: number;
  grade: HealthGrade;
  categories: CategoryScore[];
}

export interface PortfolioHealth {
  score: number;
  grade: HealthGrade;
  categories: CategoryScore[];
  coveredCount: number;
  totalCount: number;
}

function gradeForScore(score: number): HealthGrade {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  if (score >= 40) return 'D';
  return 'F';
}

/**
 * Value-weights each covered holding's health score/categories by market
 * value. Holdings with no entry in `healthBySymbol` (no persisted
 * screener_stats row, or a NULL health_score) are excluded entirely — not
 * on-demand fetched. Returns null when nothing is covered.
 */
export function computePortfolioHealth(
  holdings: { symbol: string; marketValue: number | undefined }[],
  healthBySymbol: Map<string, TickerHealth>
): PortfolioHealth | null {
  const covered = holdings.filter((h) => h.marketValue && h.marketValue > 0 && healthBySymbol.has(h.symbol));
  const totalValue = covered.reduce((sum, h) => sum + (h.marketValue ?? 0), 0);

  if (covered.length === 0 || totalValue <= 0) {
    return null;
  }

  let score = 0;
  for (const h of covered) {
    const weight = (h.marketValue ?? 0) / totalValue;
    score += healthBySymbol.get(h.symbol)!.score * weight;
  }

  // Each category is weighted independently over only the holdings that
  // actually have that category's data — a holding whose aggregate score is
  // known but whose category breakdown hasn't synced yet (see
  // health-summary/route.ts's dataAvailable flag) must not drag a category's
  // average toward zero just for being present in the portfolio.
  const categories: CategoryScore[] = CATEGORY_ORDER.map((name) => {
    const max = CATEGORY_MAX[name];
    const withCategory = covered.filter((h) => {
      const cat = healthBySymbol.get(h.symbol)!.categories.find((c) => c.name === name);
      return cat && cat.dataAvailable !== false;
    });
    const categoryValue = withCategory.reduce((sum, h) => sum + (h.marketValue ?? 0), 0);

    if (categoryValue <= 0) {
      return { name, score: 0, max, label: 'Unavailable', dataAvailable: false };
    }

    const weighted = withCategory.reduce((sum, h) => {
      const cat = healthBySymbol.get(h.symbol)!.categories.find((c) => c.name === name)!;
      return sum + cat.score * ((h.marketValue ?? 0) / categoryValue);
    }, 0);

    const catScore = Math.round(weighted);
    return { name, score: catScore, max, label: catLabel(catScore, max) };
  });

  const roundedScore = Math.round(score);

  return {
    score: roundedScore,
    grade: gradeForScore(roundedScore),
    categories,
    coveredCount: covered.length,
    totalCount: holdings.length,
  };
}

export interface CategoryContributor {
  symbol: string;
  score: number;
  max: number;
  /** This holding's share of covered portfolio value, 0-100. */
  weight: number;
}

/**
 * Per-holding breakdown for a single category, sorted best-scoring first —
 * powers the drill-in popover ("which holdings drag this category up/down").
 * Same coverage rules as computePortfolioHealth: only holdings with that
 * category's data available are included.
 */
export function getCategoryContributors(
  categoryName: string,
  holdings: { symbol: string; marketValue: number | undefined }[],
  healthBySymbol: Map<string, TickerHealth>
): CategoryContributor[] {
  const covered = holdings.filter((h) => h.marketValue && h.marketValue > 0 && healthBySymbol.has(h.symbol));
  const totalValue = covered.reduce((sum, h) => sum + (h.marketValue ?? 0), 0);
  if (totalValue <= 0) return [];

  const contributors: CategoryContributor[] = [];
  for (const h of covered) {
    const cat = healthBySymbol.get(h.symbol)!.categories.find((c) => c.name === categoryName);
    if (!cat || cat.dataAvailable === false) continue;
    contributors.push({
      symbol: h.symbol,
      score: cat.score,
      max: cat.max,
      weight: ((h.marketValue ?? 0) / totalValue) * 100,
    });
  }

  return contributors.sort((a, b) => b.score - a.score);
}
