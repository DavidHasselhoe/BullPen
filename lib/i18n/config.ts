// i18n configuration for BullPen
// Supports multiple languages with fallback to English

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import translation files
import en from './locales/en.json';
import es from './locales/es.json';
import fr from './locales/fr.json';
import de from './locales/de.json';
import ja from './locales/ja.json';
import zh from './locales/zh.json';
import no from './locales/no.json';

const resources = {
  en: { translation: en },
  es: { translation: es },
  fr: { translation: fr },
  de: { translation: de },
  ja: { translation: ja },
  zh: { translation: zh },
  no: { translation: no },
};

i18n
  .use(LanguageDetector) // Detect user's browser language
  .use(initReactI18next) // Passes i18n down to react-i18next
  .init({
    resources,
    fallbackLng: 'en', // Use English if translation is missing
    defaultNS: 'translation',
    
    interpolation: {
      escapeValue: false, // React already escapes values
    },
    
    // Language detection options
    detection: {
      order: ['localStorage', 'navigator'], // Check localStorage first, then browser
      caches: ['localStorage'], // Cache language preference in localStorage
      lookupLocalStorage: 'i18nextLng', // Key to store language in localStorage
    },
    
    // React i18next options
    react: {
      useSuspense: false, // Disable suspense for SSR compatibility
    },
  });

export default i18n;
