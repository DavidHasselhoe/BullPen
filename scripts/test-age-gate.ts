/**
 * Assert-based check for the signup age gate's date logic. No framework.
 *   npx tsx scripts/test-age-gate.ts
 *
 * The birthday boundary is the whole point: someone turning 13 today must get
 * in and someone turning 13 tomorrow must not, or the gate is either blocking
 * teenagers or admitting 12-year-olds.
 */

import assert from 'node:assert/strict';
import {
  ageOn,
  checkDateOfBirth,
  maxAllowedDobValue,
  MIN_SIGNUP_AGE_YEARS,
} from '../lib/auth/age-gate';

const now = new Date('2026-09-22T12:00:00Z');

// Exact boundary
assert.equal(checkDateOfBirth('2013-09-22', now), null, 'turns 13 today: allowed');
assert.equal(checkDateOfBirth('2013-09-23', now), 'tooYoung', 'turns 13 tomorrow: blocked');
assert.equal(checkDateOfBirth('2013-09-21', now), null, 'turned 13 yesterday: allowed');

// Clearly either side
assert.equal(checkDateOfBirth('1990-01-01', now), null);
assert.equal(checkDateOfBirth('2020-06-15', now), 'tooYoung');

// Leap-day birthday, checked on a non-leap year
assert.equal(checkDateOfBirth('2012-02-29', new Date('2025-02-28T12:00:00Z')), 'tooYoung', 'day before the leap birthday');
assert.equal(checkDateOfBirth('2012-02-29', new Date('2025-03-01T12:00:00Z')), null, 'day after');

// Bad input
assert.equal(checkDateOfBirth('', now), 'missing');
assert.equal(checkDateOfBirth('not-a-date', now), 'unparseable');
assert.equal(checkDateOfBirth('2025-02-30', now), 'unparseable', 'JS would roll this to March 2nd');
assert.equal(checkDateOfBirth('2026-09-23', now), 'future');
assert.equal(checkDateOfBirth('1850-01-01', now), 'implausible');

// The input's own max attribute must agree with the validator
const max = maxAllowedDobValue(now);
assert.equal(max, '2013-09-22', 'max is the newest passing date');
assert.equal(checkDateOfBirth(max, now), null, 'max itself passes');

assert.equal(ageOn(new Date('2000-01-01T00:00:00Z'), now), 26);
assert.equal(MIN_SIGNUP_AGE_YEARS, 13);

console.log('ok - age gate boundaries hold at 13, including the leap-day case');
