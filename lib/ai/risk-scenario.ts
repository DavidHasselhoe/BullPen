import { createServerClient } from '@/lib/supabase/client';
import { loadPositions } from '@/lib/holdings/portfolio-positions';
import type { HoldingInput } from '@/lib/ai/risk-analysis-prompt';
import type { Portfolio } from '@/lib/ai/portfolio-builder/schema';
import type { ScenarioShare } from '@/lib/ai/risk-scenario-shares';

/**
 * "What would my risk look like if I actually bought this?"
 *
 * Turns a built portfolio plus the book someone already owns into one
 * combined holdings list for the risk analysis. Assembled here on the server,
 * from the generation row and their real positions, so a request can't ask
 * for a risk report on a portfolio the user does not have.
 *
 * The result carries percentages and no money. A built portfolio is a set of
 * weights, not an amount, so there is no honest figure to put next to it: the
 * prompt reads allocations and leaves the total value line out entirely
 * rather than printing a number nobody chose.
 */

// Sizes and their validation live in a leaf module both this and the client can import.
export { SCENARIO_SHARES, parseScenarioShare } from '@/lib/ai/risk-scenario-shares';

export interface RiskScenario {
  holdings: HoldingInput[];
  /** The prompt's own words for what this is, and the marker on the row that keeps it out of history. */
  note: string;
  /**
   * The same thing as data, saved with the report so the banner can be
   * written in the reader's language. The note cannot be: it is composed on
   * a background task that never sees which language they read in.
   */
  summary: { count: number; theme: string; share: ScenarioShare };
}

export async function buildRiskScenario(
  userId: string,
  generationId: string,
  share: ScenarioShare,
): Promise<RiskScenario | null> {
  const supabase = createServerClient();
  const { data: generation } = await supabase
    .from('portfolio_generations')
    .select('portfolio')
    .eq('id', generationId)
    .eq('user_id', userId)
    .eq('status', 'done')
    .maybeSingle();

  const portfolio = (generation as { portfolio: Portfolio } | null)?.portfolio;
  if (!portfolio?.holdings?.length) return null;

  const { positions } = await loadPositions(userId);
  if (positions.length === 0) return null;

  // Everything is rescaled onto one 100% book: what is owned keeps its
  // relative shape and gives up `share` percent of the whole to the proposal.
  const scale = 100 / (100 + share);

  const combined = new Map<string, HoldingInput>();
  for (const p of positions) {
    combined.set(p.ticker, {
      symbol: p.ticker,
      company_name: p.company,
      allocation: p.weightPct * scale,
    });
  }

  for (const h of portfolio.holdings) {
    const ticker = h.ticker.toUpperCase();
    const added = share * (h.allocation_pct / 100) * scale;
    const existing = combined.get(ticker);
    // A proposal that tops up something already owned is one bigger position,
    // not two lines. Two lines would double the symbol in the sector
    // breakdown and in the value-weighted health score.
    combined.set(ticker, {
      symbol: ticker,
      company_name: existing?.company_name ?? h.company,
      allocation: (existing?.allocation ?? 0) + added,
      // Marked only when the whole line is new. A top-up is a position they
      // genuinely hold, at a weight this scenario changes, and calling it
      // proposed would invite advice to sell something they never bought.
      proposed: existing ? undefined : true,
    });
  }

  const holdings = [...combined.values()].sort((a, b) => (b.allocation ?? 0) - (a.allocation ?? 0));
  const count = portfolio.holdings.length;
  // theme_summary is model-written and runs anywhere from four words to a
  // paragraph. This is a label in one sentence, so it gets a label's length.
  const theme = portfolio.theme_summary.length > 72
    ? `${portfolio.theme_summary.slice(0, 71).trimEnd()}…`
    : portfolio.theme_summary;
  const note = `Includes ${count} proposed ${count === 1 ? 'position' : 'positions'} from "${theme}", sized as a ${share}% addition to what you hold today. Weights only, no amounts.`;

  return { holdings, note, summary: { count, theme, share } };
}
