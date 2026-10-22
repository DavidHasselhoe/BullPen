/**
 * The first-touch invite cookie, read after signup by
 * maybeClaimShareAttribution (lib/auth/share-attribution.ts). Set from the
 * invite page once it has confirmed the code belongs to an account; the first
 * invite a visitor opens wins, matching the share links' bp_ref rule.
 */
export const INVITE_COOKIE_NAME = 'bp_inv';

export function rememberInviteCode(code: string): void {
  if (typeof document === 'undefined') return;
  if (document.cookie.split('; ').some((c) => c.startsWith(`${INVITE_COOKIE_NAME}=`))) return;
  const secure = location.protocol === 'https:' ? '; secure' : '';
  document.cookie = `${INVITE_COOKIE_NAME}=${encodeURIComponent(code.toLowerCase())}; max-age=${60 * 60 * 24 * 30}; path=/; samesite=lax${secure}`;
}
