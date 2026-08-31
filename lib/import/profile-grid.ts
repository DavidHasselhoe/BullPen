import type { Grid } from './types';
import { ISIN_RE } from './isin';

export interface GridColumnProfile {
  index: number;
  header: string;
  nonEmptyRatio: number;
  distinctCount: number;
  /** Present only when distinctCount <= 40 — the complete set, not a
   *  sample, so a rare value (a transaction type appearing once in 1000
   *  rows) is never missed by random sampling. */
  distinctValues?: string[];
  samples: string[];
  looksNumeric: boolean;
  looksDate: boolean;
  looksIsin: boolean;
}

export interface GridProfile {
  columns: GridColumnProfile[];
  rowCount: number;
  sampleRows: string[][];
  sampleRowIndices: number[];
  hints: {
    decimalSeparatorGuess: 'DOT' | 'COMMA' | 'UNKNOWN';
    duplicateHeaders: Record<string, number[]>;
  };
}

const LOW_CARDINALITY_LIMIT = 40;
const CELL_TRUNCATE = 60;

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
}

/** Spreads N sample indices roughly evenly across the row range, always
 *  including the first and last row. */
function spreadIndices(total: number, count: number): number[] {
  if (total <= count) return Array.from({ length: total }, (_, i) => i);
  const out = new Set<number>();
  out.add(0);
  out.add(total - 1);
  for (let i = 1; i < count - 1; i++) {
    out.add(Math.round((i * (total - 1)) / (count - 1)));
  }
  return Array.from(out).sort((a, b) => a - b);
}

export function profileGrid(grid: Grid): GridProfile {
  const { rows, columnCount, header } = grid;
  const columns: GridColumnProfile[] = [];

  const duplicateHeaders: Record<string, number[]> = {};
  const headerPositions = new Map<string, number[]>();
  header.forEach((h, i) => {
    const list = headerPositions.get(h) ?? [];
    list.push(i);
    headerPositions.set(h, list);
  });
  for (const [h, positions] of headerPositions) {
    if (positions.length > 1) duplicateHeaders[h] = positions;
  }

  let decimalCommaVotes = 0;
  let decimalDotVotes = 0;

  for (let col = 0; col < columnCount; col++) {
    const values = rows.map((r) => r[col] ?? '');
    const nonEmpty = values.filter((v) => v.trim() !== '');
    const distinct = new Set(nonEmpty);

    const numericLike = nonEmpty.filter((v) => /^-?[\d.,\s']+$/.test(v.trim()) && /\d/.test(v));
    const looksNumeric = nonEmpty.length > 0 && numericLike.length / nonEmpty.length > 0.8;
    const looksDate = nonEmpty.length > 0 && nonEmpty.filter((v) => /\d{4}|\d{1,2}[./-]\d{1,2}/.test(v)).length / nonEmpty.length > 0.8;
    const looksIsin = nonEmpty.length > 0 && nonEmpty.filter((v) => ISIN_RE.test(v.trim().toUpperCase())).length / nonEmpty.length > 0.5;

    if (looksNumeric) {
      for (const v of numericLike) {
        const lastDot = v.lastIndexOf('.');
        const lastComma = v.lastIndexOf(',');
        if (lastDot !== -1 && lastComma === -1) decimalDotVotes++;
        if (lastComma !== -1 && lastDot === -1) {
          const after = v.slice(lastComma + 1).replace(/\D/g, '');
          if (after.length !== 3) decimalCommaVotes++;
        }
      }
    }

    const profile: GridColumnProfile = {
      index: col,
      header: truncate(header[col] ?? '', 40),
      nonEmptyRatio: rows.length > 0 ? nonEmpty.length / rows.length : 0,
      distinctCount: distinct.size,
      samples: spreadIndices(nonEmpty.length, 8).map((i) => truncate(nonEmpty[i], CELL_TRUNCATE)),
      looksNumeric,
      looksDate,
      looksIsin,
    };
    if (distinct.size > 0 && distinct.size <= LOW_CARDINALITY_LIMIT) {
      profile.distinctValues = Array.from(distinct).map((v) => truncate(v, CELL_TRUNCATE));
    }
    columns.push(profile);
  }

  const sampleRowIndices = spreadIndices(rows.length, 12);
  const sampleRows = sampleRowIndices.map((i) => rows[i].map((c) => truncate(c, CELL_TRUNCATE)));

  const decimalSeparatorGuess: GridProfile['hints']['decimalSeparatorGuess'] =
    decimalCommaVotes > 0 ? 'COMMA' : decimalDotVotes > 0 ? 'DOT' : 'UNKNOWN';

  return {
    columns,
    rowCount: rows.length,
    sampleRows,
    sampleRowIndices,
    hints: { decimalSeparatorGuess, duplicateHeaders },
  };
}
