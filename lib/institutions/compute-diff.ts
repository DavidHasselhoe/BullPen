/**
 * Quarter-over-quarter holdings diff — computed on read, not stored. A diff
 * is a cheap join between two already-persisted holdings sets; nothing
 * about it justifies a materialized table, and computing on read means no
 * backfill step is ever needed when a prior quarter's parse gets corrected.
 * Callers should cache the computed result (see the /holdings route), not
 * this function itself.
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
  valueChangePct: number; // signed, e.g. +42.5 or -18.2
}

export interface HoldingsDiff {
  newPositions: DiffableHolding[];
  exited: DiffableHolding[];
  increased: HoldingChange[];
  decreased: HoldingChange[];
  concentrationTop10: DiffableHolding[];
}

const MATERIAL_CHANGE_THRESHOLD_PCT = 5; // below this, treat as "roughly flat", not increased/decreased

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
    if (prior.valueUsd <= 0) continue; // avoid divide-by-zero on a degenerate prior row
    const valueChangePct = ((holding.valueUsd - prior.valueUsd) / prior.valueUsd) * 100;
    if (valueChangePct >= MATERIAL_CHANGE_THRESHOLD_PCT) {
      increased.push({ ...holding, prevValueUsd: prior.valueUsd, prevShares: prior.shares, valueChangePct });
    } else if (valueChangePct <= -MATERIAL_CHANGE_THRESHOLD_PCT) {
      decreased.push({ ...holding, prevValueUsd: prior.valueUsd, prevShares: prior.shares, valueChangePct });
    }
  }

  const exited = previous.filter((h) => !currentCusips.has(h.cusip));

  increased.sort((a, b) => b.valueChangePct - a.valueChangePct);
  decreased.sort((a, b) => a.valueChangePct - b.valueChangePct);

  return { newPositions, exited, increased, decreased, concentrationTop10 };
}
