// Client-side read/write for the `bp_lang` cookie. Kept in one place so
// middleware.ts's server-side write, components/i18n/LanguageProvider.tsx's
// post-auth reconciliation, and components/user/SettingsModal.tsx's save
// path all agree on the cookie name and options — see middleware.ts for the
// server-side counterpart (this file never runs there).

const LOCALE_COOKIE = 'bp_lang';
const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function writeLocaleCookie(locale: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(locale)}; max-age=${LOCALE_COOKIE_MAX_AGE}; path=/; samesite=lax`;
}
