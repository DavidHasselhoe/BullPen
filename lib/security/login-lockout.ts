// Soft, auto-expiring account lockout — triggered by actual failed login
// attempts, not just request volume (that's what the per-IP/per-identifier
// throttle in rate-limiter.ts already covers).
//
// Deliberately NOT a permanent/manual-unlock lockout: that would let an
// attacker lock any victim out of their own account just by deliberately
// failing their password a handful of times — a classic DoS-via-security-
// feature. The lockout expires on its own after LOCKOUT_TTL_SECONDS, same
// mitigation shape as every mainstream soft-lockout implementation.
//
// In local dev without Upstash configured, rget/rset/rdel are no-ops (see
// lib/cache/redis-cache.ts), so lockout is effectively disabled — consistent
// with the rest of the security stack (rate-limiter.ts skips entirely in
// development).

import { rget, rset, rdel } from '@/lib/cache/redis-cache';

const FAILURE_WINDOW_SECONDS = 15 * 60; // rolling window a failure count lives in
const LOCKOUT_THRESHOLD = 8; // failed attempts within the window before locking out
const LOCKOUT_TTL_SECONDS = 15 * 60; // how long the lockout itself lasts

function failCountKey(identifier: string): string {
  return `login-fail-count:${identifier}`;
}

function lockoutKey(identifier: string): string {
  return `login-lockout:${identifier}`;
}

export async function isLockedOut(identifier: string): Promise<boolean> {
  return !!(await rget<boolean>(lockoutKey(identifier)));
}

/** Records a failed login attempt. Returns true if this attempt just triggered a lockout. */
export async function reportFailedLogin(identifier: string): Promise<boolean> {
  const current = (await rget<number>(failCountKey(identifier))) ?? 0;
  const next = current + 1;
  await rset(failCountKey(identifier), next, FAILURE_WINDOW_SECONDS);

  if (next >= LOCKOUT_THRESHOLD) {
    await rset(lockoutKey(identifier), true, LOCKOUT_TTL_SECONDS);
    return true;
  }
  return false;
}

/** Clears the failure count on a successful login — a couple of typos before success shouldn't carry forward. */
export async function clearLoginFailures(identifier: string): Promise<void> {
  await rdel(failCountKey(identifier));
}
