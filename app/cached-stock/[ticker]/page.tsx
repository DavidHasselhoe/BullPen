/**
 * The stock page for signed-out English visitors, served from Vercel's CDN.
 *
 * Never linked or visited directly: middleware.ts rewrites /stock/<ticker> here
 * for a GET with no Supabase session cookie whose locale resolves to English
 * (crawlers, first visits), and redirects any direct request back to
 * /stock/<ticker>. Everyone else still gets the per-request render at
 * app/stock/[ticker].
 *
 * Why it exists: the root layout reads headers() and cookies(), so every page
 * renders per request. A stock page is ~819KB uncompressed (the inlined
 * stylesheet alone is ~650KB, see next.config.ts inlineCss) and crawlers walk
 * ~600 of them; that traffic took the Hobby plan past its 10GB Fast Origin
 * Transfer quota on 2026-11-13. Here the page renders at most once per ticker
 * per REVALIDATE window and the CDN serves the rest.
 *
 * force-static makes headers()/cookies() return empty, which is exactly a
 * signed-out English request: the layout falls back to 'en' and no session.
 * It also leaves the layout unable to see the path, so the stock namespace it
 * would have preloaded is added here by NamespaceBundle.
 *
 * Prices in the cached HTML are up to 5 minutes old. The client refetches the
 * snapshot once it is stale and the live price stream takes over within
 * seconds, so what a visitor watches is current.
 */

import StockPage from '@/app/stock/[ticker]/page';
import { NamespaceBundle } from '@/components/i18n/NamespaceBundle';
import stockEn from '@/lib/i18n/locales/en/stock.json';

export { generateMetadata } from '@/app/stock/[ticker]/layout';

export const dynamic = 'force-static';
export const revalidate = 300;

/** Empty: nothing is built at deploy time (that would buy ~600 snapshots), every ticker renders on first visit. */
export function generateStaticParams() {
  return [];
}

export default function CachedStockPage({ params }: { params: Promise<{ ticker: string }> }) {
  return (
    <NamespaceBundle locale="en" ns="stock" resources={stockEn}>
      {/* requireSnapshot: a failed snapshot throws, so a background regeneration
          keeps serving the last good copy instead of caching one with no price
          for every guest and crawler. buildSnapshot already falls back to stale
          cached data, so this only fires when there is no quote at all. */}
      <StockPage params={params} requireSnapshot />
    </NamespaceBundle>
  );
}
