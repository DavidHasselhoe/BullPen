import 'server-only';
import { headers } from 'next/headers';
import { ALWAYS_LOADED, namespacesForPath, type Namespace } from './namespaces';
import { isValidLocale } from './language-names';

/**
 * Reads the locale middleware already resolved (see middleware.ts's
 * `resolveLocale` + `x-bp-locale` header) — never re-derives it from cookies
 * here, so there is exactly one place that decides "what language is this
 * request in."
 */
export async function getRequestLocale(): Promise<string> {
  const h = await headers();
  const locale = h.get('x-bp-locale');
  return locale && isValidLocale(locale) ? locale : 'en';
}

/** The request path, forwarded by middleware.ts since Server Components have no direct access to it. */
export async function getRequestPathname(): Promise<string> {
  const h = await headers();
  return h.get('x-bp-pathname') ?? '/';
}

/**
 * Server-side dynamic import of one locale's namespace JSON — the same
 * `import(`./locales/${locale}/${ns}.json`)` shape the client backend in
 * lib/i18n/config.ts uses, so both paths exercise the same Turbopack chunking
 * and can't drift into two different loading behaviors.
 */
async function loadNamespace(locale: string, ns: Namespace): Promise<Record<string, unknown>> {
  try {
    const mod = await import(`./locales/${locale}/${ns}.json`);
    return mod.default ?? mod;
  } catch {
    // Missing namespace file for this locale — i18next's fallbackLng: 'en'
    // covers it at the key level; returning {} here just means this
    // particular namespace isn't preloaded and falls through to the client
    // backend fetch instead (which will hit the same fallback).
    return {};
  }
}

/**
 * Preloads ALWAYS_LOADED plus whatever `pathname`'s own area needs, for one
 * locale. Passed into createI18nInstance() (lib/i18n/config.ts) as
 * `resources` so the very first server-rendered HTML is already translated —
 * no client-side fetch, no flash of English while i18next-resources-to-backend
 * catches up after hydration.
 *
 * Shape is i18next's own `Resource` type: `{ [locale]: { [namespace]: {...} } }`
 * — nested by locale even though this function only ever fills in one,
 * because that's the shape `i18next.init({ resources })` requires.
 */
export async function loadResources(
  locale: string,
  pathname: string
): Promise<Record<string, Record<string, Record<string, unknown>>>> {
  const namespaces = [...ALWAYS_LOADED, ...namespacesForPath(pathname)];
  const entries = await Promise.all(
    namespaces.map(async (ns) => [ns, await loadNamespace(locale, ns)] as const)
  );
  return { [locale]: Object.fromEntries(entries) };
}
