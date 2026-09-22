/**
 * Age gate for signup (COPPA).
 *
 * COPPA forbids knowingly collecting personal information from children under
 * 13, and the FTC's expected mechanism is a neutral age screen: ask for a date
 * of birth plainly, without hinting which answers get you in, and don't let a
 * failed attempt be retried by just typing a different year.
 *
 * The matching server-side rule is in supabase/migrations/146_age_gate.sql.
 * This module is the UX half; that one is the boundary.
 */

/** COPPA's floor. Not a statement about teenagers — see AGE_POLICY_NOTE. */
export const MIN_SIGNUP_AGE_YEARS = 13;

/**
 * OPEN DECISION (flagged 2026-09-22, not guessed): whether 13-17 year olds may
 * hold an account at all. Arguments for 18+: a Pro subscription is a contract a
 * minor generally can't be bound to, and the product is brokerage-adjacent.
 * Arguments for 13+: it's an information and education product, not a broker,
 * and Academy suits teenagers. Norway (BullPen's home) sets the GDPR Article 8
 * digital-consent age at 13, so 13+ is lawful there without parental consent;
 * other EU states set it as high as 16, which would need per-country handling.
 * Raising the bar is one constant here plus one in the migration.
 */
export const AGE_POLICY_NOTE = 'under-13 blocked; 13-17 currently allowed pending a policy decision';

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
