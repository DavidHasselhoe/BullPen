'use client';

import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';

const SUPPORTED_LANGUAGES = ['en', 'es', 'fr', 'de', 'ja', 'zh', 'no'];

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { i18n } = useTranslation();

  useEffect(() => {
    if (user?.settings) {
      const settings = user.settings as { language?: string };
      const userLanguage = settings.language;

      if (userLanguage) {
        // User has selected a specific language
        i18n.changeLanguage(userLanguage);
        document.documentElement.lang = userLanguage;
      } else {
        // Use system/browser language
        const browserLang = navigator.language.split('-')[0];
        const detectedLang = SUPPORTED_LANGUAGES.includes(browserLang) ? browserLang : 'en';
        i18n.changeLanguage(detectedLang);
        document.documentElement.lang = detectedLang;
      }
    } else {
      // No user settings, use browser language
      const browserLang = navigator.language.split('-')[0];
      const detectedLang = SUPPORTED_LANGUAGES.includes(browserLang) ? browserLang : 'en';
      i18n.changeLanguage(detectedLang);
      document.documentElement.lang = detectedLang;
    }
  }, [user?.settings, i18n]);

  return <>{children}</>;
}
