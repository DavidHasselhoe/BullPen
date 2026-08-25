export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  zh: 'Chinese',
  no: 'Norwegian',
};

/**
 * The single source of truth for which languages the app supports. Derived
 * from LANGUAGE_NAMES rather than a second hand-maintained array — the two
 * previously lived separately (components/i18n/LanguageProvider.tsx and
 * components/user/SettingsModal.tsx each had their own copy) and drifted:
 * SettingsModal's list was missing 'no', so a Norwegian-browser user on
 * "System default" silently got English. One list can't drift from itself.
 */
export const SUPPORTED_LANGUAGES = Object.keys(LANGUAGE_NAMES) as ReadonlyArray<
  keyof typeof LANGUAGE_NAMES
>;

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

export function isSupportedLanguage(code: string): boolean {
  return code in LANGUAGE_NAMES;
}

/**
 * Dev-only pseudo-locale (`?bp_lang=qa` / `bp_lang=qa` cookie) — every string
 * wrapped in `«»` with vowels doubled (see scripts/generate-pseudo-locale.mjs).
 * Anything still rendering as plain English under this locale is, by
 * definition, an un-extracted literal. This is the primary tool for finding
 * strings a codemod missed, since `ignoreBuildErrors: true` means neither the
 * build nor a type error will catch one.
 *
 * Deliberately NOT part of SUPPORTED_LANGUAGES — it must never appear in the
 * Settings language dropdown or be selectable by a real user. isValidLocale()
 * is the separate, wider check that middleware.ts/lib/i18n/server.ts use for
 * resolving what the client is ALLOWED to request, which is real languages
 * plus this one escape hatch, gated to non-production.
 */
export const PSEUDO_LOCALE = 'qa';

export function isValidLocale(code: string): boolean {
  if (isSupportedLanguage(code)) return true;
  return code === PSEUDO_LOCALE && process.env.NODE_ENV !== 'production';
}
