import { getHoldings } from '@/lib/holdings/holdings-db';
import { createServerClient } from '@/lib/supabase/client';
import { getLastPrices, cacheLastPrice } from '@/lib/market-data/last-price-cache';
import { getStockQuotes, withRateLimitRetry } from '@/lib/twelvedata/twelvedata-client';

/**
 * The investor's book, loaded once and shaped for a model prompt.
 *
 * Shared by every feature that offers to reason about what someone already
 * owns (the portfolio builder's foundation toggle, the deep dive's fit check)
 * so those features cannot drift into describing the same portfolio two
 * different ways. `/api/holdings/positions` serves the very same numbers to
 * the consent toggle, so what the reader sees before submitting is what the
 * model is sent.
 *
 * Weights are by live market value when every position can be priced, and by
 * cost basis when even one cannot. Never a mix: a book where three rows are
 * today's value and the rest is what was paid years ago is a number nobody
 * can act on, and it would read as if it were all the same thing. `basis`
 * says which of the two happened, and callers put it in their own copy.
 *
 * Neither basis converts currency. A book holding both a US and a Norwegian
 * listing weights them against each other in their own listing currencies,
 * which is the same approximation the cost-basis weights have always carried.
 */

export interface Position {
  ticker: string;
  company: string;
  weightPct: number;
  /** Best effort, from the ticker_sectors cache. Null when not cached yet. */
  sector: string | null;
}

export type WeightBasis = 'market' | 'cost';

export interface PositionBook {
  positions: Position[];
  basis: WeightBasis;
  /** True when `exclude` dropped at least one position, so weights won't sum to 100. */
  partial: boolean;
}

/** A book longer than this is a cost problem, not an information problem. */
const MAX_POSITIONS = 60;

interface PricedRow {
  ticker: string;
  company: string;
  quantity: number;
  costValue: number;
}

export interface LoadPositionsOptions {
  /** Tickers the investor unticked in the consent toggle. Dropped after weighting. */
  exclude?: string[];
}

export async function loadPositions(
  userId: string,
  options: LoadPositionsOptions = {},
): Promise<PositionBook> {
  const empty: PositionBook = { positions: [], basis: 'cost', partial: false };

  const result = await getHoldings(userId);
  if (!result.success) return empty;

  const rows = (result.holdings ?? []).filter(
    (h) => (h.quantity ?? 0) > 1e-9 && (h.avg_price ?? 0) > 0,
  );
  if (rows.length === 0) return empty;

  // Ranked and capped on cost before anything is priced, so the quote fan-out
  // is bounded by MAX_POSITIONS no matter how long the book is.
  const ranked: PricedRow[] = rows
    .map((h) => ({
      ticker: h.symbol.toUpperCase(),
      company: h.company_name ?? h.symbol.toUpperCase(),
      quantity: h.quantity ?? 0,
      costValue: (h.quantity ?? 0) * (h.avg_price ?? 0),
    }))
    .sort((a, b) => b.costValue - a.costValue)
    .slice(0, MAX_POSITIONS);

  const prices = await priceEveryPosition(ranked.map((r) => r.ticker));
  const basis: WeightBasis = prices ? 'market' : 'cost';
  const valueOf = (r: PricedRow) => (prices ? r.quantity * prices.get(r.ticker)! : r.costValue);

  const total = ranked.reduce((sum, r) => sum + valueOf(r), 0);
  if (total <= 0) return empty;

  const positions: Position[] = ranked
    .map((r) => ({
      ticker: r.ticker,
      company: r.company,
      weightPct: Number(((valueOf(r) / total) * 100).toFixed(1)),
      sector: null as string | null,
    }))
    .sort((a, b) => b.weightPct - a.weightPct);

  // Excluded after weighting, never before: a withheld position still occupied
  // its share of the money, so renormalising the rest to 100% would overstate
  // every remaining weight. The kept rows carry their true share of the whole
  // book and simply don't add up, which the callers' copy says out loud.
  const excluded = new Set((options.exclude ?? []).map((t) => t.toUpperCase()));
  const kept = excluded.size > 0 ? positions.filter((p) => !excluded.has(p.ticker)) : positions;
  if (kept.length === 0) return empty;

  await attachSectors(kept);
  return { positions: kept, basis, partial: kept.length < positions.length };
}

/**
 * Today's price for every ticker, or null if even one is missing.
 *
 * Redis first (`last-price-cache` is shared with the screener, holdings and
 * watchlist, so a reader who just looked at their portfolio pays nothing),
 * then one batched `/quote` for whatever is left — 1 credit per symbol,
 * capped at MAX_POSITIONS, on a path that is already spending a model call.
 *
 * All-or-nothing on purpose: partial coverage would silently mean partial
 * truth, and crypto, delisted tickers and foreign listings are exactly the
 * positions most likely to go missing.
 */
async function priceEveryPosition(tickers: string[]): Promise<Map<string, number> | null> {
  const prices = new Map<string, number>();

  for (const [ticker, seed] of await getLastPrices(tickers)) {
    if (Number.isFinite(seed.price) && seed.price > 0) prices.set(ticker, seed.price);
  }

  const missing = tickers.filter((t) => !prices.has(t));
  if (missing.length > 0) {
    try {
      const quotes = await withRateLimitRetry(() => getStockQuotes(missing));
      for (const [symbol, quote] of quotes) {
        if (!quote || !Number.isFinite(quote.c) || quote.c <= 0) continue;
        const upper = symbol.toUpperCase();
        prices.set(upper, quote.c);
        cacheLastPrice(upper, { price: quote.c, changePercent: Number.isFinite(quote.dp) ? quote.dp : null });
      }
    } catch (err) {
      // Cost basis is a complete, honest answer. Today's prices for two thirds
      // of a book is not, so a failed fetch falls all the way back.
      console.error('[portfolio-positions] quote fetch failed, falling back to cost basis:', err);
      return null;
    }
  }

  return tickers.every((t) => prices.has(t)) ? prices : null;
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

/**
 * A request body's exclude list, made safe to compare tickers against.
 *
 * Nothing worse than a mismatch can happen downstream (an unrecognised symbol
 * simply excludes nothing), but this is user input crossing into a prompt
 * path, so it is bounded and shaped here rather than trusted by each route.
 */
export function parseExcludeList(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const cleaned = input
    .filter((v): v is string => typeof v === 'string')
    .map((v) => v.trim().toUpperCase())
    .filter((v) => /^[A-Z0-9.\-/]{1,12}$/.test(v));
  return [...new Set(cleaned)].slice(0, MAX_POSITIONS);
}

/** How the weights below were arrived at, for the sentence above them. */
export function basisLabel(basis: WeightBasis): string {
  return basis === 'market' ? 'live market value' : 'cost basis (what was paid)';
}

/** One line per position, for a prompt. */
export function renderPositionLines(positions: Position[], basis: WeightBasis): string {
  const unit = basis === 'market' ? '% of market value' : '% of cost basis';
  return positions
    .map((p) => `- ${p.ticker} (${p.company}): ${p.weightPct}${unit}${p.sector ? ` · ${p.sector}` : ''}`)
    .join('\n');
}

/** The sentence a prompt needs when the investor withheld part of their book. */
export const PARTIAL_BOOK_NOTE =
  'The investor chose not to share part of their portfolio. The weights below are shares of the whole book, so they will not add up to 100%, and the remainder is positions you have not been told about. Do not infer what they are, and do not treat the listed positions as the entire portfolio.';

/**
 * Deliberately no sectorWeights() helper here, even now that coverage is good.
 * Coverage is "good", not complete: crypto and ETFs have no sector at all, and
 * a percentage summed over only the classified part of a book would read as if
 * it described the whole thing. The model is given the tickers and works the
 * concentration out itself, accurately, and nothing renders a sector
 * percentage from this data.
 */
