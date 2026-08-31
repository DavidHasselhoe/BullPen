import type { NumberStyle } from './types';

// Non-breaking ( ), narrow non-breaking ( ) and thin ( )
// spaces all show up as thousands separators in European exports.
const SPACE_VARIANTS = /[   ]/g;

const THOUSANDS_CHARS: Record<string, NumberStyle['thousands']> = {
  '.': 'DOT',
  ',': 'COMMA',
  ' ': 'SPACE',
  "'": 'APOSTROPHE',
};

const THOUSANDS_SEP_CHAR: Record<NumberStyle['thousands'], string | null> = {
  NONE: null,
  DOT: '.',
  COMMA: ',',
  SPACE: ' ',
  APOSTROPHE: "'",
};

/**
 * Infers decimal vs. thousands separator over a POPULATION of numeric cells
 * from one column, not per-cell — this is load-bearing. A Nordnet "Antall"
 * (quantity) column contains both `12,641` (fractional shares — comma is
 * decimal) and `57,2` (2 trailing digits — also decimal). Only seeing every
 * value in the column together proves the comma is never a thousands
 * separator here; per-cell heuristics can't tell `12,641` from a genuine
 * twelve-thousand-six-hundred-forty-one.
 */
export function inferNumberStyle(samples: string[]): NumberStyle {
  const cleaned = samples
    .map((s) => s.trim().replace(SPACE_VARIANTS, ' '))
    .filter((s) => s.length > 0 && /[0-9]/.test(s));

  if (cleaned.length === 0) {
    return { decimal: 'DOT', thousands: 'NONE' };
  }

  // Rule 1: a cell with both '.' and ',' — whichever comes LAST is decimal.
  for (const s of cleaned) {
    const lastDot = s.lastIndexOf('.');
    const lastComma = s.lastIndexOf(',');
    if (lastDot !== -1 && lastComma !== -1) {
      return lastDot > lastComma
        ? { decimal: 'DOT', thousands: 'COMMA' }
        : { decimal: 'COMMA', thousands: 'DOT' };
    }
  }

  // Rule 2: for each separator character seen anywhere, check whether it is
  // ALWAYS followed by exactly 3 digits (consistent with thousands-grouping)
  // or whether ANY occurrence breaks that pattern (proving it's decimal).
  const sepStats = new Map<string, { total: number; nonTriple: number }>();
  for (const s of cleaned) {
    for (const sep of Object.keys(THOUSANDS_CHARS)) {
      if (!s.includes(sep)) continue;
      const stat = sepStats.get(sep) ?? { total: 0, nonTriple: 0 };
      const parts = s.split(sep);
      for (let i = 1; i < parts.length; i++) {
        stat.total++;
        const digitsAfter = /^[0-9]+/.exec(parts[i])?.[0]?.length ?? 0;
        if (digitsAfter !== 3) stat.nonTriple++;
      }
      sepStats.set(sep, stat);
    }
  }

  let decimalSep: string | null = null;
  let thousandsSep: string | null = null;
  for (const [sep, stat] of sepStats) {
    if (stat.nonTriple > 0) {
      decimalSep = sep;
    } else if (stat.total > 0) {
      thousandsSep = sep;
    }
  }

  if (decimalSep === '.') return { decimal: 'DOT', thousands: thousandsSep ? THOUSANDS_CHARS[thousandsSep] : 'NONE' };
  if (decimalSep === ',') return { decimal: 'COMMA', thousands: thousandsSep ? THOUSANDS_CHARS[thousandsSep] : 'NONE' };

  // No separator ever proved itself decimal. If one was seen at all and is
  // always followed by exactly 3 digits, treat it as thousands with '.' as
  // the (unseen) decimal point. Otherwise default to DOT/NONE.
  if (thousandsSep) {
    return { decimal: 'DOT', thousands: THOUSANDS_CHARS[thousandsSep] };
  }
  return { decimal: 'DOT', thousands: 'NONE' };
}

/** Parses one cell to a number given an already-inferred style. Returns
 *  null (never NaN) for empty or unparseable input. */
export function parseDecimal(raw: string, style: NumberStyle): number | null {
  let s = raw.trim().replace(SPACE_VARIANTS, ' ');
  if (s.length === 0) return null;

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  } else if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1);
  }

  s = s.replace(/[^0-9.,'\s]/g, ''); // strip currency symbols, letters, %

  const decimalChar = style.decimal === 'COMMA' ? ',' : '.';
  const thousandsChar = THOUSANDS_SEP_CHAR[style.thousands];

  // Remove the thousands separator entirely — it carries no numeric value.
  if (thousandsChar && thousandsChar !== decimalChar) {
    s = s.split(thousandsChar).join('');
  }
  // Convert the real decimal separator to '.', keeping only the LAST
  // occurrence as the fraction boundary (defends against a stray leftover
  // separator the style inference didn't account for on this one cell).
  const parts = s.split(decimalChar);
  s = parts.length > 1 ? parts.slice(0, -1).join('') + '.' + parts[parts.length - 1] : parts[0];
  s = s.replace(/[^0-9.]/g, '');

  if (s === '' || s === '.') return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -Math.abs(n) : n;
}
