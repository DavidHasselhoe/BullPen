// i18next configuration for BullPen.
//
// Locales are lazy-loaded per (language, namespace) via
// i18next-resources-to-backend rather than statically imported. The old
// version did `import en from './locales/en.json'` etc. for all 7 languages,
// which shipped every locale to every client regardless of which one they
// use — invisible at 83 keys (~27KB total) but ~968KB at full catalog size.
// See docs/superpowers/plans/... (i18n effort) for the measurement.
//
// `resources` (server-preloaded namespaces for the active locale, so first
// paint has no client-side fetch waterfall) is passed in per-request from
// app/layout.tsx via lib/i18n/server.ts — this module has no knowledge of
// the request and must stay safe to import from a Client Component.

import i18n, { type i18n as I18nInstance } from 'i18next';
import { initReactI18next } from 'react-i18next';
import resourcesToBackend from 'i18next-resources-to-backend';
import { ALWAYS_LOADED } from './namespaces';

export interface CreateI18nOptions {
  locale: string;
  /**
   * Server-preloaded resources, i18next's own `Resource` shape: `{ [locale]:
   * { [namespace]: {...} } }` — see lib/i18n/server.ts's loadResources().
   */
  resources?: Record<string, Record<string, Record<string, unknown>>>;
}

/**
 * Creates a fresh i18next instance per request/render rather than mutating a
 * module-level singleton. i18next's default singleton (`import i18n from
 * 'i18next'; i18n.init(...)`) is a global — safe in a browser tab, but Next.js
 * Server Components share the module cache across requests, so a singleton
 * would leak one user's language into another's response. Each call to
 * createI18nInstance gets its own instance via i18n.createInstance().
 */
export function createI18nInstance({ locale, resources }: CreateI18nOptions): I18nInstance {
  const instance = i18n.createInstance();

  instance
    .use(initReactI18next)
    .use(
      resourcesToBackend(
        (language: string, namespace: string) =>
          import(`./locales/${language}/${namespace}.json`)
      )
    )
    .init({
      lng: locale,
      fallbackLng: 'en',
      ns: ALWAYS_LOADED as unknown as string[],
      defaultNS: 'common',
      resources,
      // Resources passed in above are treated as a partial preload, not the
      // full set — i18next-resources-to-backend still lazy-fetches whatever
      // namespace a useTranslation() call asks for beyond those.
      partialBundledLanguages: true,
      interpolation: { escapeValue: false }, // React already escapes values
      react: { useSuspense: false }, // SSR compatibility
    });

  return instance;
}
