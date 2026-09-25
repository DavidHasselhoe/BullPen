/**
 * Age gate for signup (COPPA).
 *
 * A date field rather than an "I am over 18" checkbox on purpose. A yes/no age
 * question tells you the answer that gets you in, which is why the FTC's
 * guidance on COPPA asks for a neutral age screen instead: request a date of
 * birth plainly, without hinting which answers pass, and don't let a failed
 * attempt be retried by typing a different year. The checkbox on the signup
 * form does a different job, which is accepting the terms.
 *
 * The matching server-side rule is in supabase/migrations/146_age_gate.sql.
 * This module is the UX half; that one is the boundary.
 */

/** Minimum age to hold a BullPen account. See AGE_POLICY_NOTE. */
export const MIN_SIGNUP_AGE_YEARS = 18;

/**
 * DECIDED 2026-09-22 (David): 18, not COPPA's floor of 13.
 *
 * The reasoning is that 18 is when someone can open a brokerage account of
 * their own, so a product built around holdings, brokerage sync and a paid
 * subscription has no real audience below it. A Pro subscription is also a
 * contract, and a minor's contract is voidable, which makes a teenage
 * subscriber a chargeback with extra steps.
 *
 * Worth noting what this does to the COPPA question it started as: it does not
 * merely handle under-13 signups, it removes them. No account can exist below
 * 13, so there is no under-13 personal information to protect in the first
 * place. It also sidesteps GDPR Article 8, whose digital-consent age varies by
 * member state (13 in Norway, up to 16 elsewhere) and would otherwise need
 * per-country handling.
 *
 * Kept in step with min_age_years in supabase/migrations/147_age_gate_eighteen.sql.
 */
export const AGE_POLICY_NOTE = '18 or over, decided 2026-09-22; under-18 signups are refused';

export type AgeGateError = 'missing' | 'unparseable' | 'future' | 'implausible' | 'tooYoung';

/** Whole years between `dob` and `on`, the way a birthday is counted. */
export function ageOn(dob: Date, on: Date): number {
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  const monthDelta = on.getUTCMonth() - dob.getUTCMonth();
  if (monthDelta < 0 || (monthDelta === 0 && on.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

/**
 * Validates a `<input type="date">` value (always `YYYY-MM-DD`).
 * Parsed as UTC deliberately: `new Date('2010-05-01')` is already UTC midnight,
 * and comparing it against a local-time "now" is what makes birthday-boundary
 * bugs, so both sides are read in UTC.
 */
export function checkDateOfBirth(value: string, now: Date = new Date()): AgeGateError | null {
  if (!value) return 'missing';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'unparseable';

  const dob = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(dob.getTime())) return 'unparseable';
  // Round-trip guards against the silent rollover of an impossible date:
  // new Date('2025-02-30') is March 2nd, not an error.
  if (dob.toISOString().slice(0, 10) !== value) return 'unparseable';

  if (dob.getTime() > now.getTime()) return 'future';

  const age = ageOn(dob, now);
  if (age > 120) return 'implausible';
  if (age < MIN_SIGNUP_AGE_YEARS) return 'tooYoung';
  return null;
}

export function isOldEnough(value: string, now: Date = new Date()): boolean {
  return checkDateOfBirth(value, now) === null;
}

/** Latest date that still passes, for the date input's `max`. */
export function maxAllowedDobValue(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear() - MIN_SIGNUP_AGE_YEARS, now.getUTCMonth(), now.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

/** Earliest date that still passes (the 'implausible' cutoff), for the picker's year range. */
export function minAllowedDobValue(now: Date = new Date()): string {
  return `${now.getUTCFullYear() - 120}-01-01`;
}

// ── Failed-attempt memory ───────────────────────────────────────────────────
// An age screen that lets a child immediately retype a different year isn't a
// screen. sessionStorage (not local) keeps it to the browsing session, which is
// the FTC's own example of a reasonable block, and avoids a permanent mark on a
// shared family computer.

const BLOCKED_KEY = 'bp.ageGateBlocked';

export function rememberAgeGateFailure(): void {
  try {
    window.sessionStorage.setItem(BLOCKED_KEY, '1');
  } catch {
    // Private mode or storage disabled. The in-memory state still blocks this
    // form; a new tab getting another try is an acceptable ceiling here.
  }
}

export function isAgeGateBlocked(): boolean {
  try {
    return window.sessionStorage.getItem(BLOCKED_KEY) === '1';
  } catch {
    return false;
  }
}
