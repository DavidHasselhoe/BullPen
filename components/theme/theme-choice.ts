/**
 * Which theme an account renders. Plain module (no 'use client') so the root
 * layout's server render and the client ThemeProvider share one rule.
 *
 * Dark only when the account saved it, or a legacy non-light value (a removed
 * gradient theme). Unset is light: guests and new accounts, so the landing
 * page, onboarding and the app look like one product. The accounts that
 * existed before light became the default (2026-11-16) were backfilled to an
 * explicit 'dark', which is what they had been seeing.
 */
export function isDarkTheme(settings: unknown): boolean {
  const theme = (settings as { theme?: unknown } | null | undefined)?.theme;
  return typeof theme === 'string' && theme !== '' && theme !== 'light';
}
