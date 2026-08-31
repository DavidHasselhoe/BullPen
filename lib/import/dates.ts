import { DATE_FORMATS, type DateFormat } from './types';

const MONTH_NAMES: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function resolveYear(raw: string): number {
  const n = Number(raw);
  if (raw.length === 4) return n;
  // Two-digit year: 00-68 -> 2000s, 69-99 -> 1900s (POSIX convention).
  return n <= 68 ? 2000 + n : 1900 + n;
}

/**
 * Parses a single date cell against an EXPLICIT format — never `new
 * Date(string)`, which applies the server's local timezone and can silently
 * reinterpret an ambiguous string. Returns null (never an invalid date
 * object) on any mismatch. Output is always YYYY-MM-DD.
 */
export function parseDate(raw: string, format: DateFormat): string | null {
  const s = raw.trim();
  if (!s) return null;

  if (format === 'YYYY-MM-DD' || format === 'YYYY/MM/DD') {
    const m = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
    if (!m) return null;
    return finalize(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  if (format === 'YYYYMMDD') {
    const m = /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if (!m) return null;
    return finalize(Number(m[1]), Number(m[2]), Number(m[3]));
  }
  if (format === 'DD.MM.YYYY' || format === 'DD/MM/YYYY' || format === 'DD-MM-YYYY') {
    const m = /^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/.exec(s);
    if (!m) return null;
    return finalize(Number(m[3]), Number(m[2]), Number(m[1]));
  }
  if (format === 'MM/DD/YYYY' || format === 'MM-DD-YYYY') {
    const m = /^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/.exec(s);
    if (!m) return null;
    return finalize(Number(m[3]), Number(m[1]), Number(m[2]));
  }
  if (format === 'DD.MM.YY') {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{2})$/.exec(s);
    if (!m) return null;
    return finalize(resolveYear(m[3]), Number(m[2]), Number(m[1]));
  }
  if (format === 'MM/DD/YY') {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(s);
    if (!m) return null;
    return finalize(resolveYear(m[3]), Number(m[1]), Number(m[2]));
  }
  if (format === 'DD/MM/YY') {
    const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/.exec(s);
    if (!m) return null;
    return finalize(resolveYear(m[3]), Number(m[2]), Number(m[1]));
  }
  if (format === 'DD-MMM-YYYY') {
    const m = /^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/.exec(s);
    if (!m) return null;
    const month = MONTH_NAMES[m[2].toLowerCase()];
    if (!month) return null;
    return finalize(Number(m[3]), month, Number(m[1]));
  }
  if (format === 'MMM DD, YYYY') {
    const m = /^([A-Za-z]{3})\s+(\d{1,2}),\s*(\d{4})$/.exec(s);
    if (!m) return null;
    const month = MONTH_NAMES[m[1].toLowerCase()];
    if (!month) return null;
    return finalize(Number(m[3]), month, Number(m[2]));
  }
  return null;
}

function finalize(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 1970 || year > 2100) return null;
  // Reject calendar-invalid combinations (e.g. day 31 in April) via a real
  // UTC construction check, without letting timezone affect interpretation.
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
    return null;
  }
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/** True if `s` matches DD/MM/YYYY-shaped punctuation with two 1-2 digit
 *  parts before a 4-digit year (or vice versa) — the family of formats
 *  where day/month order is genuinely ambiguous per-cell. */
function splitNumericDateParts(s: string): [string, string, string] | null {
  const m = /^(\d{1,4})[.\-/](\d{1,4})[.\-/](\d{1,4})$/.exec(s.trim());
  return m ? [m[1], m[2], m[3]] : null;
}

export interface DateFormatInference {
  format: DateFormat | null;
  ambiguous: boolean;
  reason: string;
}

/**
 * Infers the date format over a population of samples. DD/MM vs MM/DD is
 * resolved in code wherever possible: if any first-part value exceeds 12,
 * it must be DMY; if any second-part value exceeds 12, it must be MDY. Only
 * when neither ever happens is the file genuinely ambiguous — the caller
 * decides the default (locale hint, then the app's UI language, then DMY).
 */
export function inferDateFormat(samples: string[]): DateFormatInference {
  const nonEmpty = samples.map((s) => s.trim()).filter(Boolean);
  if (nonEmpty.length === 0) {
    return { format: null, ambiguous: true, reason: 'no samples' };
  }

  // ISO first — the common, unambiguous case.
  if (nonEmpty.every((s) => /^\d{4}-\d{2}-\d{2}$/.test(s))) {
    return { format: 'YYYY-MM-DD', ambiguous: false, reason: 'ISO 8601' };
  }
  if (nonEmpty.every((s) => /^\d{8}$/.test(s))) {
    return { format: 'YYYYMMDD', ambiguous: false, reason: 'compact ISO' };
  }
  if (nonEmpty.every((s) => /^\d{4}\/\d{2}\/\d{2}$/.test(s))) {
    return { format: 'YYYY/MM/DD', ambiguous: false, reason: 'ISO with slashes' };
  }

  const parts = nonEmpty.map(splitNumericDateParts).filter((p): p is [string, string, string] => p !== null);
  if (parts.length === 0) {
    return { format: null, ambiguous: true, reason: 'unrecognized shape' };
  }

  const separator = /^\d{1,2}\.(\d{1,2})\.\d{4}$/.test(nonEmpty[0]) ? '.'
    : nonEmpty[0].includes('/') ? '/' : '-';
  const yearFirst = parts.every((p) => p[0].length === 4);
  if (yearFirst) {
    return { format: separator === '/' ? 'YYYY/MM/DD' : 'YYYY-MM-DD', ambiguous: false, reason: 'year-first' };
  }

  const firstOver12 = parts.some((p) => Number(p[0]) > 12);
  const secondOver12 = parts.some((p) => Number(p[1]) > 12);

  if (firstOver12 && !secondOver12) {
    const fmt = separator === '.' ? 'DD.MM.YYYY' : separator === '/' ? 'DD/MM/YYYY' : 'DD-MM-YYYY';
    return { format: fmt, ambiguous: false, reason: 'day > 12 seen in first part' };
  }
  if (secondOver12 && !firstOver12) {
    const fmt = separator === '/' ? 'MM/DD/YYYY' : 'MM-DD-YYYY';
    return { format: fmt, ambiguous: false, reason: 'day > 12 seen in second part' };
  }
  if (firstOver12 && secondOver12) {
    return { format: null, ambiguous: true, reason: 'conflicting: both parts exceed 12 somewhere' };
  }

  // Neither part ever exceeds 12 — genuinely ambiguous.
  return {
    format: separator === '.' ? 'DD.MM.YYYY' : separator === '/' ? 'DD/MM/YYYY' : 'DD-MM-YYYY',
    ambiguous: true,
    reason: 'neither part ever exceeds 12',
  };
}

export { DATE_FORMATS };
export type { DateFormat };
