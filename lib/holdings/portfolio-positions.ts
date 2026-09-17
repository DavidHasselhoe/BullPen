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

  await attachSectors(positions);
  return positions;
}

/**
 * Sectors, from all three places this app keeps them.
 *
 * They are kept in three tables filled by three different paths, and reading
 * only one of them is why the AI features saw sectors for 3 of a 10-position
 * test book while the database actually knew 9 of them. Nothing here costs an
 * API call: it is data already sitting in Postgres.
 *
 * Precedence is deliberate, because the tables disagree. `ticker_sectors` is
 * written from a live /profile lookup and carries an updated_at.
 * `screener_stats` is refreshed by the screener cron. `companies` is a
 * 39-row hand-seeded table that has drifted: it files GOOGL and META under
 * Technology where the other two correctly say Communication Services, so it
 * is consulted last and only when nothing else knows.
 *
 * Best effort by design. A position with no sector anywhere (crypto, ETFs,
 * some foreign listings) simply carries null, and the prompt reads one line
 * less specific rather than waiting on a paid fan-out.
 */
async function attachSectors(positions: Position[]): Promise<void> {
  const tickers = positions.map((p) => p.ticker);
  const supabase = createServerClient();

  const [cached, screener, companies] = await Promise.all([
    supabase.from('ticker_sectors').select('ticker, sector').in('ticker', tickers),
    supabase.from('screener_stats').select('ticker, sector').in('ticker', tickers),
    supabase.from('companies').select('ticker, sector').in('ticker', tickers),
  ]);

  const bySymbol = new Map<string, string>();
  // Lowest precedence first, so a better source overwrites a worse one.
  for (const result of [companies, screener, cached]) {
    for (const row of (result.data ?? []) as Array<{ ticker: string; sector: string | null }>) {
      if (row.sector && row.sector.trim()) bySymbol.set(row.ticker.toUpperCase(), row.sector.trim());
    }
  }

  for (const p of positions) p.sector = bySymbol.get(p.ticker) ?? null;
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
 * Deliberately no sectorWeights() helper here, even now that coverage is good.
 * Coverage is "good", not complete: crypto and ETFs have no sector at all, and
 * a percentage summed over only the classified part of a book would read as if
 * it described the whole thing. The model is given the tickers and works the
 * concentration out itself, accurately, and nothing renders a sector
 * percentage from this data.
 */
