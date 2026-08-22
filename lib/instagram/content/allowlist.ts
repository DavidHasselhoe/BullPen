/**
 * The curated set of tickers public Instagram content is allowed to name —
 * shared by every content-type generator (earnings-calendar.ts,
 * earnings-results.ts) so there's one list to maintain, not a copy per
 * generator that can silently drift apart.
 *
 * SIGNIFICANT_TICKERS (S&P 500 + Nasdaq 100) plus manual, individually-
 * vetted additions — index membership alone misses genuinely relevant
 * names that are simply too newly public to be index-eligible yet.
 * Deliberately a curated list, not a dynamic trending feed: precise and
 * auditable, at the cost of needing a human to add the next one.
 *
 * - TSM (Taiwan Semiconductor, NYSE ADR): neither S&P 500-eligible
 *   (foreign-domiciled) nor Nasdaq 100-eligible (NYSE-listed, not Nasdaq),
 *   but its TwelveData earnings history is clean and reliable, and it's
 *   genuinely market-moving for a tech-focused audience. Checked live
 *   against TwelveData before adding: Samsung's only US data is a thin
 *   OTC pink-sheet ticker (SSNLF) with irregular/unreliable report dates,
 *   and SK Hynix has no usable US ticker at all — neither is a realistic
 *   addition through this data source.
 * - CRWV (CoreWeave) and NBIS (Nebius Group): both real, sizable
 *   companies ($58B/$66B market cap as of 2026-08-13, per screener_stats —
 *   larger than plenty of S&P 500 constituents) at the center of the AI
 *   infrastructure trade. NOTE: both were added to the real Nasdaq 100 in
 *   the June 2026 rebalance, but lib/market-data/nasdaq100.ts hasn't been
 *   refreshed to reflect that yet (confirmed missing from that file
 *   2026-08-13) — kept in this manual list until it is, otherwise they'd
 *   silently drop out again. Worth re-checking after nasdaq100.ts is next
 *   updated; if these are in SIGNIFICANT_TICKERS by then, they're
 *   redundant here (harmless either way — this is a Set).
 * - A wider batch added 2026-08-13, all confirmed to have real name +
 *   market-cap coverage in screener_stats before adding (several needed a
 *   one-off fix first — either the row was missing entirely, tier-0 and
 *   never refreshed, or had name literally equal to its own ticker
 *   symbol, the same bug already found and fixed for TGT). Grouped by
 *   theme purely for readability, not a functional distinction:
 *   - Fintech: SOFI, AFRM, CRCL
 *   - EV / mobility: RIVN, LCID, JOBY, ACHR
 *   - Consumer / social: RDDT, RBLX, CVNA, CAVA, OPEN
 *   - Betting / gaming: DKNG
 *   - Crypto-adjacent: BMNR, MARA, RIOT, CLSK
 *   - AI / speculative tech: IONQ, RGTI, QBTS, SYM
 *   - Software / cloud: SNOW, U
 *   Deliberately NOT added: MSTR and ARM are both already in
 *   lib/market-data/nasdaq100.ts, so SIGNIFICANT_TICKERS already covers
 *   them — adding them here too would just be redundant.
 */

import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';
import { NASDAQ100_TICKERS } from '@/lib/market-data/nasdaq100';

export const INSTAGRAM_ALLOWLIST: Set<string> = new Set([
  ...SIGNIFICANT_TICKERS,
  'TSM', 'CRWV', 'NBIS',
  'SOFI', 'AFRM', 'CRCL',
  'RIVN', 'LCID', 'JOBY', 'ACHR',
  'RDDT', 'RBLX', 'CVNA', 'CAVA', 'OPEN',
  'DKNG',
  'BMNR', 'MARA', 'RIOT', 'CLSK',
  'IONQ', 'RGTI', 'QBTS', 'SYM',
  'SNOW', 'U',
]);

/** Nasdaq-100 names sort ahead of other allowlisted names in every carousel
 *  list — the more actively-traded/recognizable half of the audience. */
export const NASDAQ100_SET = new Set(NASDAQ100_TICKERS);
