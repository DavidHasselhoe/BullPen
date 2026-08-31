/**
 * ISIN detection and validation. The repo has zero ISIN support anywhere
 * else — this is the first. The check digit matters: without it, a random
 * 12-character product code (common in broker exports) reads as a valid
 * ISIN, burns a TwelveData credit, and returns garbage.
 */

export const ISIN_RE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

/** ISO 3166-1 alpha-2 prefix of an ISIN, e.g. 'NO' for Norway. Not validated
 *  against the real country list here — callers that care can cross-check. */
export function isinCountryPrefix(isin: string): string {
  return isin.slice(0, 2).toUpperCase();
}

/** Luhn mod-10 over the ISIN with letters expanded to two-digit numbers
 *  (A=10 ... Z=35), per ISO 6166. */
export function isValidIsin(raw: string): boolean {
  const v = raw.trim().toUpperCase();
  if (!ISIN_RE.test(v)) return false;

  let digits = '';
  for (const ch of v) {
    if (ch >= 'A' && ch <= 'Z') {
      digits += String(ch.charCodeAt(0) - 55);
    } else {
      digits += ch;
    }
  }

  let sum = 0;
  let doubleIt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (doubleIt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    doubleIt = !doubleIt;
  }
  return sum % 10 === 0;
}
