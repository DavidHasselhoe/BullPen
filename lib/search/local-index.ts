/**
 * Local symbol search — the thing that makes search feel instant.
 *
 * The catalogue (~17k US stocks and ETFs) is downloaded once from
 * /api/search/index and searched here, in the browser, on every keystroke. A
 * full scan with scoring measures at well under a millisecond, which is far
 * below the frame budget, so there is no debounce, no request, and nothing to
 * wait for: results are on screen in the same frame the character appears in.
 *
 * A scan beats a trie or an inverted index here for a reason worth keeping: at
 * this size the scan is already imperceptible, and an index structure would
 * have to be built at parse time, kept in sync, and would still need this exact
 * scoring pass over its candidates.
 */

export interface SymbolEntry {
  ticker: string;
  name: string;
  /** 's' = stock, 'e' = ETF, 'f' = index fund */
  kind: 's' | 'e' | 'f';
  /** 0-99 popularity, precomputed server-side (see lib/search/index-rank.ts). */
  rank: number;
  /** Lowercased once at parse time so the hot loop never calls toLowerCase. */
  tl: string;
  nl: string;
}

/** Parse the tab-separated payload from /api/search/index. */
export function parseSearchIndex(payload: string): SymbolEntry[] {
  const out: SymbolEntry[] = [];
  if (!payload) return out;
  for (const line of payload.split('\n')) {
    if (!line) continue;
    const [ticker, name, kind, rank] = line.split('\t');
    if (!ticker || !name) continue;
    out.push({
      ticker,
      name,
      kind: kind === 'e' || kind === 'f' ? kind : 's',
      rank: Number(rank) || 0,
      tl: ticker.toLowerCase(),
      nl: name.toLowerCase(),
    });
  }
  return out;
}

/**
 * Match tiers, spaced far enough apart that rank (0-99) can only reorder within
 * a tier and never promote a weaker kind of match over a stronger one.
 */
const EXACT_TICKER = 10_000;
const TICKER_PREFIX = 8_000;
const NAME_PREFIX = 6_000;
const NAME_WORD = 4_000;
const NAME_SUBSTRING = 2_000;
const TICKER_SUBSTRING = 1_000;

function scoreEntry(entry: SymbolEntry, q: string): number {
  const { tl, nl } = entry;

  let tier = 0;
  if (tl === q) tier = EXACT_TICKER;
  else if (tl.startsWith(q)) {
    // Among prefix matches of equal standing the shorter ticker is the likelier
    // intent, but only as a tiebreak — at a steeper penalty this outweighed rank
    // and put NVR ahead of NVIDIA for "nv".
    tier = TICKER_PREFIX - tl.length * 3;
  } else if (nl.startsWith(q) || (nl.startsWith('the ') && nl.startsWith(q, 4))) {
    // A leading article is not part of how anyone refers to a company. Without
    // this, "coca" ranked Coca-Cola Consolidated above The Coca-Cola Company,
    // because only the former had the query at character zero.
    tier = NAME_PREFIX;
  }
  else {
    const at = nl.indexOf(q);
    // How deep in the name the match sits is itself a relevance signal: for
    // "s&p 500", "Vanguard S&P 500 ETF" is a better answer than a fund whose
    // name mentions the index halfway through its third qualifier. Capped so it
    // can never reach into the next tier.
    const depth = Math.min(at, 40);
    if (at > 0 && nl.charCodeAt(at - 1) === 32) tier = NAME_WORD - depth;
    else if (at > 0) tier = NAME_SUBSTRING - depth;
    else if (tl.includes(q)) tier = TICKER_SUBSTRING;
    else return 0;
  }

  // Stocks edge out funds at equal strength: someone typing "tesl" wants TSLA,
  // not the nine Tesla-derivative ETFs whose names also start that way.
  return tier + entry.rank + (entry.kind === 's' ? 50 : 0);
}

/**
 * Rank the catalogue against a query. Returns at most `limit` entries, best
 * first. An empty or whitespace-only query returns nothing rather than an
 * arbitrary slice of the alphabet.
 */
export function searchSymbols(index: SymbolEntry[], query: string, limit = 8): SymbolEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  // Keeping only the running top-N avoids sorting thousands of weak matches on
  // every keystroke — for a query like "a" that is most of the catalogue.
  const best: Array<{ score: number; entry: SymbolEntry }> = [];
  let worst = 0;

  for (const entry of index) {
    const score = scoreEntry(entry, q);
    if (score === 0) continue;
    if (best.length === limit && score <= worst) continue;

    let i = best.length - 1;
    best.push({ score, entry });
    while (i >= 0 && best[i].score < score) {
      best[i + 1] = best[i];
      i--;
    }
    best[i + 1] = { score, entry };
    if (best.length > limit) best.pop();
    worst = best[best.length - 1].score;
  }

  return best.map((b) => b.entry);
}
