import type { MetadataRoute } from 'next';
import { canonicalGlossaryTerms, glossarySlug } from '@/lib/finance/glossary';
import { createServerClient } from '@/lib/supabase/client';
import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';

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
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const BASE_URL = 'https://bullpen.no';

  const routes: { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { path: '/', priority: 1.0, changeFrequency: 'daily' },
    { path: '/upgrade', priority: 0.9, changeFrequency: 'monthly' },
    { path: '/academy', priority: 0.8, changeFrequency: 'weekly' },
    { path: '/discover', priority: 0.8, changeFrequency: 'daily' },
    // Bull's Weekly Pick track record — public (see app/api/picks/*), and the
    // whole point of a track record is that it's checkable without signing up.
    { path: '/picks', priority: 0.7, changeFrequency: 'weekly' },
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

  // One entry per published pick — real, permanent content (the whole point
  // is the thesis and its result never change after publication).
  const supabase = createServerClient();
  const { data: pickRows } = await supabase
    .from('ai_stock_picks')
    .select('pick_date')
    .order('pick_date', { ascending: false });
  const pickEntries = (pickRows ?? []).map((row) => ({
    url: `${BASE_URL}/picks/${(row as { pick_date: string }).pick_date}`,
    lastModified,
    changeFrequency: 'weekly' as const,
    priority: 0.5,
  }));

  // The curated crawl-allow set from robots.ts (S&P 500 + Nasdaq 100) —
  // everything else under /stock/ stays both disallowed and un-sitemapped.
  // Live price data, so 'daily' and a moderate priority (below the static
  // content pages above, which change far less often but matter more).
  const stockEntries = [...SIGNIFICANT_TICKERS].map((ticker) => ({
    url: `${BASE_URL}/stock/${ticker}`,
    lastModified,
    changeFrequency: 'daily' as const,
    priority: 0.6,
  }));

  return [...staticEntries, ...glossaryEntries, ...pickEntries, ...stockEntries];
}
