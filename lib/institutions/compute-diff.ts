/**
 * Quarter-over-quarter holdings diff — computed on read, not stored. A diff
 * is a cheap join between two already-persisted holdings sets; nothing
 * about it justifies a materialized table, and computing on read means no
 * backfill step is ever needed when a prior quarter's parse gets corrected.
 * Callers should cache the computed result (see the /holdings route), not
 * this function itself.
 *
 * Classification is on SHARE COUNT, not market value. Value moves with price:
 * keyed on value, a fund that did not trade a single share reads "Increased
 * +12%" in a quarter its holdings rallied. Verified against real data --
 * Berkshire held exactly 227,917,808 Apple shares across both 2025-12-31 and
 * 2026-03-31 while the position's value fell about 7%, which is "Unchanged",
 * not a trim.
 */

export interface DiffableHolding {
  cusip: string;
  symbol: string | null;
  nameOfIssuer: string;
  valueUsd: number;
  shares: number;
  portfolioPct: number | null;
}

export interface HoldingChange extends DiffableHolding {
  prevValueUsd: number;
  prevShares: number;
  /** Signed change in share count -- the classifier, e.g. +42.5 or -18.2. */
  sharesChangePct: number;
  /** Signed change in market value. Display only: shown beside the share
   *  change so a split (shares way up, value flat) is visible to anyone
   *  reading the badge. Never used to classify. */
  valueChangePct: number;
}

export interface HoldingsDiff {
  newPositions: DiffableHolding[];
  exited: DiffableHolding[];
  increased: HoldingChange[];
  decreased: HoldingChange[];
  concentrationTop10: DiffableHolding[];
}

export type HoldingStatus = 'new' | 'sold_out' | 'increased' | 'reduced' | 'unchanged';

/**
 * Below this, a share-count move is noise rather than a decision: odd-lot
 * rounding, sub-manager reshuffles, dividend reinvestment. A fund that moves
 * 0.4% of a position did not change its mind about the company.
 */
export const UNCHANGED_BAND_PCT = 1;

export function computeHoldingsDiff(
  current: DiffableHolding[],
  previous: DiffableHolding[] | null
): HoldingsDiff | null {
  const concentrationTop10 = [...current]
    .sort((a, b) => b.valueUsd - a.valueUsd)
    .slice(0, 10);

  if (!previous) {
    return null; // no prior quarter to compare against (fund just added, or first quarter tracked)
  }

  const prevByCusip = new Map(previous.map((h) => [h.cusip, h]));
  const currentCusips = new Set(current.map((h) => h.cusip));

  const newPositions: DiffableHolding[] = [];
  const increased: HoldingChange[] = [];
  const decreased: HoldingChange[] = [];

  for (const holding of current) {
    const prior = prevByCusip.get(holding.cusip);
    if (!prior) {
      newPositions.push(holding);
      continue;
    }
    if (prior.shares <= 0) continue; // degenerate prior row: no denominator, reads as unchanged

    const sharesChangePct = ((holding.shares - prior.shares) / prior.shares) * 100;
    const valueChangePct =
      prior.valueUsd > 0 ? ((holding.valueUsd - prior.valueUsd) / prior.valueUsd) * 100 : 0;
    const change: HoldingChange = {
      ...holding,
      prevValueUsd: prior.valueUsd,
      prevShares: prior.shares,
      sharesChangePct,
      valueChangePct,
    };

    if (sharesChangePct > UNCHANGED_BAND_PCT) {
      increased.push(change);
    } else if (sharesChangePct < -UNCHANGED_BAND_PCT) {
      decreased.push(change);
    }
    // Within the band: omitted from both arrays, which IS "unchanged".
  }

  const exited = previous.filter((h) => !currentCusips.has(h.cusip));

  increased.sort((a, b) => b.sharesChangePct - a.sharesChangePct);
  decreased.sort((a, b) => a.sharesChangePct - b.sharesChangePct);

  return { newPositions, exited, increased, decreased, concentrationTop10 };
}

/**
 * Per-holding status lookup, built on the client from the arrays above.
 *
 * The status deliberately does NOT travel over the wire. This diff is
 * JSON-serialized twice, into market_data_cache's JSONB column and again over
 * HTTP: a Map would serialize to `{}` and silently ship an empty diff, and a
 * plain object keyed by cusip would add 7166 entries for a fund like Citadel,
 * ~99% of them the default state. Array membership already carries it, and
 * "unchanged" is the free complement of the four sets.
 */
export function buildStatusIndex(diff: HoldingsDiff | null): {
  statusFor: (cusip: string) => HoldingStatus;
  changeFor: (cusip: string) => HoldingChange | undefined;
} {
  if (!diff) {
    return { statusFor: () => 'unchanged', changeFor: () => undefined };
  }

  const status = new Map<string, HoldingStatus>();
  const changes = new Map<string, HoldingChange>();

  for (const h of diff.newPositions) status.set(h.cusip, 'new');
  for (const h of diff.exited) status.set(h.cusip, 'sold_out');
  for (const h of diff.increased) {
    status.set(h.cusip, 'increased');
    changes.set(h.cusip, h);
  }
  for (const h of diff.decreased) {
    status.set(h.cusip, 'reduced');
    changes.set(h.cusip, h);
  }

  return {
    statusFor: (cusip) => status.get(cusip) ?? 'unchanged',
    changeFor: (cusip) => changes.get(cusip),
  };
}

/*
 * ponytail: stock splits are not corrected for. A 4:1 split quadruples the
 * share count with no trade behind it, so it reads as "Increased +300%".
 * Correcting it needs per-symbol corporate actions -- getSplits() in
 * lib/twelvedata/twelvedata-client.ts costs 1 credit per symbol, i.e. ~7000
 * for one Citadel quarter, which does not fit the budget. The "shares x4 while
 * value flat means split" heuristic is deliberately NOT used: it misreads
 * exactly the interesting trade, a fund genuinely doubling into a stock that
 * halved. Mitigation instead: valueChangePct rides along so the badge can show
 * "shares +300% - value +2%", which makes a split self-evident to a reader.
 * Upgrade path if anyone reports a bogus badge: resolve splits for the ~20 top
 * holdings the UI actually renders, cached by symbol:quarter.
 */
