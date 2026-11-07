import type { NumberStyle } from './types';

// Non-breaking ( ), narrow non-breaking ( ) and thin ( )
// spaces all show up as thousands separators in European exports.
const SPACE_VARIANTS = /[   ]/g;

const THOUSANDS_SEP_CHAR: Record<NumberStyle['thousands'], string | null> = {
  NONE: null,
  DOT: '.',
  COMMA: ',',
  SPACE: ' ',
  APOSTROPHE: "'",
};

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
