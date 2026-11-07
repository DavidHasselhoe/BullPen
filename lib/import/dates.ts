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

export interface DateFormatInference {
  format: DateFormat | null;
  ambiguous: boolean;
  reason: string;
}

export { DATE_FORMATS };
export type { DateFormat };
