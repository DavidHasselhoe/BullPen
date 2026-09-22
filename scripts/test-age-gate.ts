/**
 * Assert-based check for the signup age gate's date logic. No framework.
 *   npx tsx scripts/test-age-gate.ts
 *
 * The birthday boundary is the whole point: someone turning 18 today must get
 * in and someone turning 18 tomorrow must not, or the gate is either blocking
 * adults or admitting minors. Written against MIN_SIGNUP_AGE_YEARS rather than
 * a hardcoded 18, so moving the threshold moves the test with it instead of
 * leaving a test that passes for the wrong reason.
 */

import assert from 'node:assert/strict';
import {
  ageOn,
  checkDateOfBirth,
  maxAllowedDobValue,
  MIN_SIGNUP_AGE_YEARS,
} from '../lib/auth/age-gate';

const now = new Date('2026-09-22T12:00:00Z');

/** The date someone who turns exactly MIN_SIGNUP_AGE_YEARS on `on` was born. */
function bornExactlyOfAge(on: Date, dayOffset = 0): string {
  const d = new Date(
    Date.UTC(on.getUTCFullYear() - MIN_SIGNUP_AGE_YEARS, on.getUTCMonth(), on.getUTCDate() + dayOffset)
  );
  return d.toISOString().slice(0, 10);
}

// Exact boundary
assert.equal(checkDateOfBirth(bornExactlyOfAge(now), now), null, 'comes of age today: allowed');
assert.equal(checkDateOfBirth(bornExactlyOfAge(now, 1), now), 'tooYoung', 'comes of age tomorrow: blocked');
assert.equal(checkDateOfBirth(bornExactlyOfAge(now, -1), now), null, 'came of age yesterday: allowed');

// Clearly either side
assert.equal(checkDateOfBirth('1990-01-01', now), null);
assert.equal(checkDateOfBirth('2012-06-15', now), 'tooYoung', 'a 14 year old is blocked');
assert.equal(checkDateOfBirth('2009-06-15', now), 'tooYoung', 'a 17 year old is blocked');
assert.equal(checkDateOfBirth('2020-06-15', now), 'tooYoung', 'a 6 year old is blocked');

// Leap-day birthday, checked on a non-leap year
const leapEve = new Date('2030-02-28T12:00:00Z');
const leapDay = new Date('2030-03-01T12:00:00Z');
assert.equal(checkDateOfBirth('2012-02-29', leapEve), 'tooYoung', 'day before the leap birthday');
assert.equal(checkDateOfBirth('2012-02-29', leapDay), null, 'day after');

// Bad input
assert.equal(checkDateOfBirth('', now), 'missing');
assert.equal(checkDateOfBirth('not-a-date', now), 'unparseable');
assert.equal(checkDateOfBirth('2025-02-30', now), 'unparseable', 'JS would roll this to March 2nd');
assert.equal(checkDateOfBirth('2026-09-23', now), 'future');
assert.equal(checkDateOfBirth('1850-01-01', now), 'implausible');

// The input's own max attribute must agree with the validator
const max = maxAllowedDobValue(now);
assert.equal(max, bornExactlyOfAge(now), 'max is the newest passing date');
assert.equal(checkDateOfBirth(max, now), null, 'max itself passes');

assert.equal(ageOn(new Date('2000-01-01T00:00:00Z'), now), 26);
assert.equal(MIN_SIGNUP_AGE_YEARS, 18, 'policy decided 2026-09-22: 18 or over');

console.log(`ok - age gate boundaries hold at ${MIN_SIGNUP_AGE_YEARS}, including the leap-day case`);
