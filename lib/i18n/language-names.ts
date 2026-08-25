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
