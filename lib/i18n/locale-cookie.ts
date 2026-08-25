// Client-side read/write for the `bp_lang` cookie. Kept in one place so
// middleware.ts's server-side write, components/i18n/LanguageProvider.tsx's
// post-auth reconciliation, and components/user/SettingsModal.tsx's save
// path all agree on the cookie name and options — see middleware.ts for the
// server-side counterpart (this file never runs there).

const LOCALE_COOKIE = 'bp_lang';
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year, matches middleware.ts

export function readLocaleCookie(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${LOCALE_COOKIE}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export function writeLocaleCookie(locale: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; max-age=${LOCALE_COOKIE_MAX_AGE}; path=/; samesite=lax`;
}
