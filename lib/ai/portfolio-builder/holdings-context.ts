import { getHoldings } from '@/lib/holdings/holdings-db';

/**
 * The user's real book, rendered for the portfolio builder's prompt.
 *
 * Only ever built when the user ticks "Use my holdings as the foundation" on
 * that specific generation. The toggle is the consent: it names what gets
 * sent and shows the positions on screen before anything is submitted, so
 * nothing about a user's portfolio reaches a model because of a setting they
 * turned on months ago and forgot.
 *
 * Weights are by cost basis, which is what the holdings row stores. Live
 * market-value weights would need a quote per symbol on a path that is
 * already a paid model call, and "roughly how much of my money sits here" is
 * the question the prompt actually needs answered. The block says so out
 * loud rather than letting the model present a cost-basis weight as today's.
 */

export interface HoldingsContext {
  /** Prompt text appended to the thesis. Empty when there is nothing to send. */
  block: string;
  /** Tickers included, for the caller to record or display. */
  tickers: string[];
}

interface Position {
  ticker: string;
  company: string;
  weightPct: number;
}

const MAX_POSITIONS = 60;

export async function buildHoldingsContext(userId: string): Promise<HoldingsContext | null> {
  const result = await getHoldings(userId);
  if (!result.success) return null;

  const rows = (result.holdings ?? []).filter(
    (h) => (h.quantity ?? 0) > 1e-9 && (h.avg_price ?? 0) > 0,
  );
  if (rows.length === 0) return null;

  const totalCost = rows.reduce((sum, h) => sum + (h.quantity ?? 0) * (h.avg_price ?? 0), 0);
  if (totalCost <= 0) return null;

  const positions: Position[] = rows
    .map((h) => ({
      ticker: h.symbol.toUpperCase(),
      company: h.company_name ?? h.symbol.toUpperCase(),
      weightPct: Number(((((h.quantity ?? 0) * (h.avg_price ?? 0)) / totalCost) * 100).toFixed(1)),
    }))
    .sort((a, b) => b.weightPct - a.weightPct)
    // A book longer than this is a cost problem, not an information problem:
    // the tail below 60 positions cannot move an allocation decision.
    .slice(0, MAX_POSITIONS);

  const lines = positions.map((p) => `- ${p.ticker} (${p.company}): ${p.weightPct}% of cost basis`);

  const block = `

---

## THE INVESTOR'S EXISTING PORTFOLIO

This portfolio is the foundation. Build around it, not beside it. Weights below are by cost basis (what was paid), not live market value, so treat them as approximate sizing, never as today's precise weights, and never restate them as current values.

${lines.join('\n')}

Additional requirements for this build, on top of everything above:

1. Treat the thesis as the goal and this portfolio as the starting position. The holdings you return are what the investor would ADD, so do not re-recommend a position they already hold at a meaningful weight unless adding to it is genuinely the best expression of the thesis. When you do, say plainly in the rationale that it is an addition to an existing position, not a new one.
2. Name the real overlap. If the thesis pushes into exposure this portfolio already carries, say which holdings already provide it and what the combined weight becomes.
3. Account for concentration. If this portfolio is already heavy in a sector the thesis leans on, lead with that in diversification_analysis and size the new positions so the combined book is defensible, not so the new slice looks balanced on its own.
4. Write diversification_analysis about the COMBINED portfolio (existing plus proposed), not about the proposed holdings in isolation. That combined view is the whole reason this investor is asking.
5. Never present the result as personal financial advice, an instruction to buy or sell, or a claim about what this investor should do with their money. It is one illustrative construction of the thesis against the portfolio they described.`;

  return { block, tickers: positions.map((p) => p.ticker) };
}

/**
 * The gate: nothing about the investor's portfolio is even read unless this
 * build asked for it. Split out from the caller so the guarantee the toggle
 * makes can be tested without spending a model call to observe it
 * (scripts/test-holdings-context-gate.ts).
 */
export async function resolveHoldingsBlock(
  userId: string,
  useHoldings: boolean,
): Promise<string | undefined> {
  if (!useHoldings) return undefined;
  return (await buildHoldingsContext(userId))?.block;
}

/** The user turn: the thesis alone, unless a block was resolved above. */
export function composeUserTurn(thesis: string, holdingsBlock?: string): string {
  return holdingsBlock ? thesis + holdingsBlock : thesis;
}
