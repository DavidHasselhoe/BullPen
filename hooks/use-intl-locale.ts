'use client';

import { useTranslation } from 'react-i18next';
import { intlLocale } from '@/lib/i18n/intl-locale';

/** App-language locale for date formatting in client components. */
export function useIntlLocale(): string {
  const { i18n } = useTranslation();
  return intlLocale(i18n.resolvedLanguage ?? i18n.language);
}
