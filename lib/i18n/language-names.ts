export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  ja: 'Japanese',
  zh: 'Chinese',
  no: 'Norwegian',
};

export function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}
