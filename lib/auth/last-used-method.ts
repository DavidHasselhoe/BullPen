/**
 * Tracks which sign-in method this browser last used, purely client-side
 * (localStorage) so the login page can show a small "last used" hint —
 * mirrors Supabase's own dashboard login page. Device-local only; never
 * synced to the server, since the login page doesn't know which user is
 * about to sign in until after they authenticate.
 */

export type LastUsedAuthMethod = 'google' | 'email';

const STORAGE_KEY = 'bullpen-last-auth-method';

export function getLastUsedAuthMethod(): LastUsedAuthMethod | null {
  if (typeof window === 'undefined') return null;
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'google' || value === 'email' ? value : null;
  } catch {
    return null;
  }
}

export function setLastUsedAuthMethod(method: LastUsedAuthMethod): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, method);
  } catch {
    // Storage disabled/unavailable (e.g. some private-browsing modes) — the
    // badge just never appears next time; sign-in itself is unaffected.
  }
}
