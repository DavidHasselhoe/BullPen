import { randomBytes } from 'crypto';

/**
 * An 8-character URL-safe, cryptographically random slug for a share link
 * (e.g. "xK3mQ2Fh") — not sequential, so shares can't be enumerated by
 * incrementing an ID. 6 random bytes / base64url gives ~2.8×10^14 possible
 * values; collision risk against a share table is negligible even at scale
 * (birthday-bound collisions only become non-trivial in the billions of rows).
 */
export function generateShareId(): string {
  return randomBytes(6).toString('base64url');
}
