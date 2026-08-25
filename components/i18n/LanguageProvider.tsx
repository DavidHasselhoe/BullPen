'use client';

import { useEffect, useState } from 'react';
import { I18nextProvider } from 'react-i18next';
import { useAuth } from '@/hooks/use-auth';
import { createI18nInstance, type CreateI18nOptions } from '@/lib/i18n/config';
import { isSupportedLanguage } from '@/lib/i18n/language-names';
import { writeLocaleCookie } from '@/lib/i18n/locale-cookie';

interface LanguageProviderProps {
  children: React.ReactNode;
  locale: string;
  resources: CreateI18nOptions['resources'];
}

/**
 * Owns the i18next instance for the whole client tree. The instance is
 * created during render via useState's initializer, not in a useEffect — that
 * distinction is what kills the old flash-of-English bug. The previous
 * version called i18n.changeLanguage() inside a useEffect, so the server
 * always rendered English and the client only swapped to the right language
 * after mount; `locale`/`resources` here are already resolved server-side
 * (middleware.ts → app/layout.tsx → lib/i18n/server.ts), so the very first
 * render is already correct.
 */
export function LanguageProvider({ children, locale, resources }: LanguageProviderProps) {
  const { user } = useAuth();
  const [instance] = useState(() => createI18nInstance({ locale, resources }));

  // Reconciliation: the server resolved `locale` from the bp_lang cookie
  // (seeded from Accept-Language on a user's very first visit — see
  // middleware.ts). Once auth resolves, users.settings.language is the
  // canonical preference and may disagree — e.g. a returning user on a new
  // device/browser with no cookie yet, or one who changed language on
  // another device. When it does, update the cookie (so the next SSR request
  // agrees) and switch the live instance without a full reload. Explicitly
  // does nothing when settings.language is unset ("System default") — that
  // means trust what Accept-Language already resolved, not re-guess from
  // navigator.language, which is the same signal by another name.
  useEffect(() => {
    const settings = user?.settings as { language?: string } | undefined;
    const preferred = settings?.language;
    if (!preferred || !isSupportedLanguage(preferred)) return;
    if (preferred === instance.language) return;

    writeLocaleCookie(preferred);
    void instance.changeLanguage(preferred);
    document.documentElement.lang = preferred;
  }, [user?.settings, instance]);

  return <I18nextProvider i18n={instance}>{children}</I18nextProvider>;
}
