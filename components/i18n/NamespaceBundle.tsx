'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Adds one namespace's translations to the i18next instance before its
 * children render, for routes the root layout can't preload for.
 *
 * The root layout picks namespaces from the request path (x-bp-pathname, set
 * by middleware). A force-static route gets empty headers, so the layout only
 * loads ALWAYS_LOADED and the page would render raw keys until the lazy
 * backend fetched the rest. Adding the bundle in a useState initializer runs
 * once, during the first render, on the server and again at hydration, so
 * both render the same translated text.
 */
export function NamespaceBundle({
  locale,
  ns,
  resources,
  children,
}: {
  locale: string;
  ns: string;
  resources: Record<string, unknown>;
  children: React.ReactNode;
}) {
  const { i18n } = useTranslation();
  useState(() => {
    if (!i18n.hasResourceBundle(locale, ns)) i18n.addResourceBundle(locale, ns, resources, true, true);
    return null;
  });
  return children;
}
