import { getHoldings } from '@/lib/holdings/holdings-db';
import { createServerClient } from '@/lib/supabase/client';

/**
 * The investor's book, loaded once and shaped for a model prompt.
 *
 * Shared by every feature that offers to reason about what someone already
 * owns (the portfolio builder's foundation toggle, the deep dive's fit check)
 * so those features cannot drift into describing the same portfolio two
 * different ways.
 *
 * Weights are by cost basis, which is what the holdings row stores. Live
 * market-value weights would need a quote per symbol on a path that is already
 * a paid model call, and "roughly how much of my money sits here" is the
 * question these prompts need answered. Callers say so in their own copy
 * rather than letting a cost-basis weight pass as today's.
 */

export interface Position {
  ticker: string;
  company: string;
  weightPct: number;
  /** Best effort, from the ticker_sectors cache. Null when not cached yet. */
  sector: string | null;
}

/** A book longer than this is a cost problem, not an information problem. */
const MAX_POSITIONS = 60;

export async function loadPositions(userId: string): Promise<Position[]> {
  const result = await getHoldings(userId);
  if (!result.success) return [];

  const rows = (result.holdings ?? []).filter(
    (h) => (h.quantity ?? 0) > 1e-9 && (h.avg_price ?? 0) > 0,
  );
  if (rows.length === 0) return [];

  const totalCost = rows.reduce((sum, h) => sum + (h.quantity ?? 0) * (h.avg_price ?? 0), 0);
  if (totalCost <= 0) return [];

  const positions: Position[] = rows
    .map((h) => ({
      ticker: h.symbol.toUpperCase(),
      company: h.company_name ?? h.symbol.toUpperCase(),
      weightPct: Number(((((h.quantity ?? 0) * (h.avg_price ?? 0)) / totalCost) * 100).toFixed(1)),
      sector: null as string | null,
    }))
    .sort((a, b) => b.weightPct - a.weightPct)
    .slice(0, MAX_POSITIONS);

  // Sectors come from the same cache the holdings page reads. Best effort on
  // purpose: a missing sector makes one line less specific, where waiting on a
  // paid /profile fan-out to fill it would make the whole feature slower and
  // more expensive for a detail the model can usually infer from the ticker.
  const supabase = createServerClient();
  const { data } = await supabase
    .from('ticker_sectors')
    .select('ticker, sector')
    .in('ticker', positions.map((p) => p.ticker));

  const bySymbol = new Map(
    ((data ?? []) as Array<{ ticker: string; sector: string | null }>).map((r) => [
      r.ticker.toUpperCase(),
      r.sector,
    ]),
  );
  for (const p of positions) p.sector = bySymbol.get(p.ticker) ?? null;

  return positions;
}

/** One line per position, for a prompt. */
export function renderPositionLines(positions: Position[]): string {
  return positions
    .map(
      (p) =>
        `- ${p.ticker} (${p.company}): ${p.weightPct}% of cost basis${p.sector ? ` · ${p.sector}` : ''}`,
    )
    .join('\n');
}

/**
 * Deliberately no sectorWeights() helper here. `ticker_sectors` covered 3 of
 * this app's 10 test positions when this was written, so a weight summed from
 * it would have read "Technology 21%" for a book that is really about 70%
 * technology. A number that confident and that wrong is worse than no number:
 * the model is given the tickers and works the concentration out itself, which
 * it does accurately, and nothing renders a sector percentage from this cache.
 */
