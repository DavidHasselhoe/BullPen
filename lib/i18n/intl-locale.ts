/**
 * The locale to hand Intl / toLocale*String for dates.
 *
 * Passing `undefined` means "the browser's language", which is how a
 * Norwegian browser rendered "fredag 25. september" inside an otherwise
 * English Daily Brief. Dates follow the app language instead. Money stays
 * pinned to 'en-US' at its call sites, since every amount is in dollars.
 */
export function intlLocale(appLanguage: string | undefined): string {
  if (!appLanguage || appLanguage === 'en' || appLanguage === 'qa') return 'en-US'; // qa = pseudo-locale
  return appLanguage;
}
