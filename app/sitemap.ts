import type { MetadataRoute } from 'next';
import { canonicalGlossaryTerms, glossarySlug } from '@/lib/finance/glossary';

/**
 * Served at /sitemap.xml.
 *
 * Lists the public, indexable marketing/content pages only — mirrors the
 * intent already documented in app/robots.ts (landing, academy, discover,
 * plus the standalone marketing/legal pages). Auth-gated or personal app
 * routes (dashboard, holdings, watchlist, login, register, etc.) are
 * intentionally excluded: they require a session and aren't unique
 * indexable content for an anonymous searcher.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const BASE_URL = 'https://bullpen.no';

  const routes: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '/', priority: 1.0, changeFrequency: 'daily' },
    { path: '/pricing', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/academy', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/discover', priority: 0.8, changeFrequency: 'daily' },
    { path: '/about', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/help', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/glossary', priority: 0.6, changeFrequency: 'monthly' },
    { path: '/changelog', priority: 0.5, changeFrequency: 'weekly' },
    { path: '/roadmap', priority: 0.5, changeFrequency: 'weekly' },
    { path: '/contact', priority: 0.5, changeFrequency: 'yearly' },
    { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/disclosures', priority: 0.3, changeFrequency: 'yearly' },
    { path: '/security', priority: 0.3, changeFrequency: 'yearly' },
  ];

  const lastModified = new Date();

  const staticEntries = routes.map((route) => ({
    url: `${BASE_URL}${route.path}`,
    lastModified,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  // One entry per canonical glossary term (definition aliases are excluded —
  // see canonicalGlossaryTerms()) — real, static, zero-API-cost content, so
  // it's safe to fully index unlike /stock and /asset (see robots.ts).
  const glossaryEntries = canonicalGlossaryTerms().map((term) => ({
    url: `${BASE_URL}/glossary/${glossarySlug(term)}`,
    lastModified,
    changeFrequency: 'yearly' as const,
    priority: 0.4,
  }));

  return [...staticEntries, ...glossaryEntries];
}
