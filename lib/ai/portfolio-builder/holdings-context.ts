import {
  loadPositions,
  renderPositionLines,
  basisLabel,
  PARTIAL_BOOK_NOTE,
} from '@/lib/holdings/portfolio-positions';

/**
 * The user's real book, rendered for the portfolio builder's prompt.
 *
 * Only ever built when the user ticks "Use my holdings as the foundation" on
 * that specific generation. The toggle is the consent: it names what gets
 * sent and shows the positions on screen before anything is submitted, so
 * nothing about a user's portfolio reaches a model because of a setting they
 * turned on months ago and forgot. Positions they untick in that list are
 * never loaded into the prompt at all.
 *
 * Weights are by live market value, or by cost basis when a position could
 * not be priced. The block says which it got rather than letting the model
 * present one as the other.
 */

export interface HoldingsContext {
  /** Prompt text appended to the thesis. Empty when there is nothing to send. */
  block: string;
  /** Tickers included, for the caller to record or display. */
  tickers: string[];
}

export async function buildHoldingsContext(
  userId: string,
  exclude: string[] = [],
): Promise<HoldingsContext | null> {
  // Loading and weighting live in lib/holdings/portfolio-positions.ts, shared
  // with the deep dive's fit check so the two features cannot end up
  // describing the same portfolio two different ways.
  const { positions, basis, partial } = await loadPositions(userId, { exclude });
  if (positions.length === 0) return null;

  const lines = renderPositionLines(positions, basis);
  const basisCaveat =
    basis === 'market'
      ? `Weights below are by ${basisLabel(basis)}, priced today, so they are approximate sizing rather than a statement of account value.`
      : `Weights below are by ${basisLabel(basis)}, not live market value, so treat them as approximate sizing, never as precise current weights, and never restate them as current values.`;

  const block = `

---

## THE INVESTOR'S EXISTING PORTFOLIO

This portfolio is the foundation. Build around it, not beside it. ${basisCaveat}
${partial ? `\n${PARTIAL_BOOK_NOTE}\n` : ''}
${lines}

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
  exclude: string[] = [],
): Promise<string | undefined> {
  if (!useHoldings) return undefined;
  return (await buildHoldingsContext(userId, exclude))?.block;
}

/** The user turn: the thesis alone, unless a block was resolved above. */
export function composeUserTurn(thesis: string, holdingsBlock?: string): string {
  return holdingsBlock ? thesis + holdingsBlock : thesis;
}
