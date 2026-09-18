import {
  loadPositions,
  renderPositionLines,
  basisLabel,
  PARTIAL_BOOK_NOTE,
} from '@/lib/holdings/portfolio-positions';

/**
 * "Does this one stock fit the book I already have?" — the context that turns
 * a deep dive from a report about a company into a report about a decision.
 *
 * Only built when the reader ticks the box on that specific generation, same
 * consent shape as the portfolio builder's foundation toggle.
 *
 * Scope is deliberately narrow. This asks the model to describe overlap,
 * addition and sizing mechanics; it does not ask for a recommendation, and it
 * says so explicitly, because "should I buy this stock" asked of one security
 * against one person's money is the line between analysis and advice. The
 * report's own verdict already states a stance on the company; this section
 * states what that stance would mean next to what they own, and stops there.
 */
export async function buildPortfolioFitBlock(
  userId: string,
  symbol: string,
  checkFit: boolean,
  exclude: string[] = [],
): Promise<string | undefined> {
  // The gate lives here, not at the call site, so no caller can read someone's
  // holdings by forgetting to check the flag first. Tested in
  // scripts/test-holdings-context-gate.ts against an account that has them.
  if (!checkFit) return undefined;

  const { positions, basis, partial } = await loadPositions(userId, { exclude });
  if (positions.length === 0) return undefined;

  const held = positions.find((p) => p.ticker === symbol.toUpperCase());

  return `

---

## THE READER'S EXISTING PORTFOLIO

Weights are by ${basisLabel(basis)}, so treat them as approximate sizing. Never restate them as current values or as a portfolio total.
${partial ? `\n${PARTIAL_BOOK_NOTE}\n` : ''}
${renderPositionLines(positions, basis)}

${
  held
    ? `They already hold ${symbol.toUpperCase()}, at roughly ${held.weightPct}% of the book by ${basisLabel(basis)}. Write the fit section for someone deciding what to do with that existing position, not someone starting fresh.`
    : `They do not currently hold ${symbol.toUpperCase()}.`
}

In addition to everything above, include a top-level "portfolioFit" object in your JSON, as a sibling of "verdict" and "blocks":

"portfolioFit": {
  "overlap": string,   // What this company duplicates in the portfolio above. Name the specific holdings that already carry the same exposure and say what drives them together. If there is genuinely little overlap, say that plainly instead of manufacturing a connection.
  "adds": string,      // What exposure this brings that the portfolio above does not already have. Be specific about the mechanism, not the label: "its revenue is contracted utility spending rather than ad spending" beats "it diversifies the portfolio".
  "sizing": string     // What a position here would mean for the book's concentration, given the weights above. Describe the mechanics of that, including what already-large positions it would compound with.
}

Rules for portfolioFit, and they matter more than any style rule elsewhere:
- 45 words MAXIMUM per field. Count before you emit.
- Describe, do not instruct. No "you should buy", no target position size, no "trim X%", no verdict on whether to own it. This section explains how the company relates to the portfolio; the reader decides what to do about it.
- Use only the holdings listed above. Never invent a position, a weight, or a total portfolio value.
- If the portfolio is concentrated in what this company depends on, say so explicitly: that is the single most useful thing this section can tell them.`;
}
