import { createHash } from 'node:crypto';
import type { Grid, RawTransaction, RowError, IgnoredRow, ConsistencyReport, NumberStyle } from './types';
import type { MappingSpec } from './mapping-schema';
import { parseDecimal } from './numbers';
import { parseDate } from './dates';
import { isValidIsin } from './isin';

export interface AppliedFile {
  transactions: RawTransaction[];
  ignored: IgnoredRow[];
  rowErrors: RowError[];
  consistency: ConsistencyReport;
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

function securityKeyFor(isin: string | null, name: string | null, priceCurrency: string | null): string {
  const basis = isin ? `isin:${isin}` : `name:${normalizeName(name ?? '')}|${priceCurrency ?? ''}`;
  return createHash('sha1').update(basis).digest('hex');
}

function cellAt(row: string[], col: number | null): string {
  if (col === null) return '';
  return (row[col] ?? '').trim();
}

const CONSISTENCY_TOLERANCE = 0.05;
const CONSISTENCY_SUSPECT_RATIO = 0.2;
const CONSISTENCY_MIN_CHECKABLE = 3;

/**
 * Deterministically applies a validated MappingSpec to every row of the
 * grid. This is the step the whole "AI maps the schema, code applies it"
 * architecture is built to make trustworthy: every row lands in exactly one
 * bucket (BUY, SELL, ignored, or error), so `transactions.length +
 * ignored.length + rowErrors.length === grid.rows.length` always holds —
 * that invariant is the real argument for not doing per-row AI extraction.
 */
export function applyMapping(grid: Grid, spec: MappingSpec): AppliedFile {
  const numberStyle: NumberStyle = { decimal: spec.decimalSeparator, thousands: spec.thousandsSeparator };
  const typeAction = new Map(spec.transactionTypes.map((t) => [t.value, t.action]));

  const transactions: RawTransaction[] = [];
  const ignored: IgnoredRow[] = [];
  const rowErrors: RowError[] = [];

  const consistencyPairs: { implied: number; gross: number }[] = [];

  grid.rows.forEach((row, i) => {
    const sourceLine = grid.sourceLines[i];
    const typeValue = cellAt(row, spec.columns.transactionType);
    const action = typeAction.get(typeValue) ?? 'IGNORE';

    if (action === 'IGNORE') {
      ignored.push({ sourceLine, typeValue });
      return;
    }

    const rawDate = cellAt(row, spec.columns.tradeDate);
    const date = parseDate(rawDate, spec.dateFormat);
    if (date === null) {
      rowErrors.push({ sourceLine, code: 'bad_date' });
      return;
    }
    if (date > new Date().toISOString().slice(0, 10)) {
      rowErrors.push({ sourceLine, code: 'future_date' });
      return;
    }

    const rawQuantity = cellAt(row, spec.columns.quantity);
    const parsedQuantity = parseDecimal(rawQuantity, numberStyle);
    if (parsedQuantity === null || parsedQuantity === 0) {
      rowErrors.push({ sourceLine, code: 'bad_quantity' });
      return;
    }
    const quantity = Math.abs(parsedQuantity); // direction comes from `action`, not the sign

    const rawPrice = cellAt(row, spec.columns.price);
    const parsedPrice = parseDecimal(rawPrice, numberStyle);
    if (parsedPrice === null) {
      rowErrors.push({ sourceLine, code: 'bad_price' });
      return;
    }
    const price = Math.abs(parsedPrice);

    const isinCell = cellAt(row, spec.columns.isin);
    const isin = isinCell && isValidIsin(isinCell) ? isinCell.toUpperCase() : null;
    const rawSymbol = spec.columns.symbol !== null ? cellAt(row, spec.columns.symbol) || null : null;
    const name = spec.columns.securityName !== null ? cellAt(row, spec.columns.securityName) || null : null;

    if (!isin && !rawSymbol && !name) {
      rowErrors.push({ sourceLine, code: 'missing_identifier' });
      return;
    }

    const priceCurrency = cellAt(row, spec.columns.priceCurrency) || null;
    const grossCurrency = cellAt(row, spec.columns.grossCurrency) || null;
    const rawGross = cellAt(row, spec.columns.grossAmount);
    const grossAmount = rawGross ? parseDecimal(rawGross, numberStyle) : null;

    const fxRateRaw = cellAt(row, spec.columns.fxRate);
    const fxRate = fxRateRaw ? parseDecimal(fxRateRaw, numberStyle) : null;
    if (grossAmount !== null) {
      const implied = quantity * price * (fxRate ?? 1);
      consistencyPairs.push({ implied, gross: Math.abs(grossAmount) });
    }

    transactions.push({
      sourceLine,
      action,
      date,
      rawDate,
      quantity,
      rawQuantity,
      price,
      rawPrice,
      securityKey: securityKeyFor(isin, name ?? rawSymbol, priceCurrency),
      isin,
      rawSymbol,
      name,
      priceCurrency,
      grossAmount,
      grossCurrency,
    });
  });

  const failed = consistencyPairs.filter(
    (p) => p.gross > 0 && Math.abs(p.implied - p.gross) / p.gross > CONSISTENCY_TOLERANCE
  ).length;
  const consistency: ConsistencyReport =
    consistencyPairs.length < CONSISTENCY_MIN_CHECKABLE
      ? { checked: consistencyPairs.length, failed, verdict: 'insufficient_data' }
      : {
          checked: consistencyPairs.length,
          failed,
          verdict: failed / consistencyPairs.length > CONSISTENCY_SUSPECT_RATIO ? 'suspect' : 'ok',
        };

  return { transactions, ignored, rowErrors, consistency };
}
