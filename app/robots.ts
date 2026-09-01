import type { MetadataRoute } from 'next';
import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';

/**
 * Served at /robots.txt.
 *
 * Strategy: let crawlers index the cheap, high-value marketing + content pages
 * (landing, academy, discover) for organic search reach, but keep them out of:
 *   - /api/           — internal endpoints; no reason for a crawler to hit them
 *   - /stock, /asset, — per-ticker pages whose render triggers credit-costing
 *     /etf              TwelveData fetches, with no natural cap on how many
 *                        obscure symbols a crawler could discover
 *   - /tools/deep-dive — auth-gated + AI-cost; nothing to index
 *   - /admin          — internal/sensitive
 *
 * Exception #1: /api/instagram/render/ must stay crawlable — it's the image_url
 * Meta's own Instagram Graph API servers fetch when publishing a carousel
 * (see app/api/instagram/render/[postId]/[slideIndex]/route.tsx), and a
 * blanket /api/ disallow blocked that fetch outright (found via a live
 * publish attempt failing with "Only photo or video can be accepted as media
 * type" — Meta's fetcher respects robots.txt same as any other crawler). The
 * more specific allow below wins over the broader /api/ disallow per the
 * standard longest-match-wins robots.txt precedence rule.
 *
 * Exception #2: SIGNIFICANT_TICKERS (S&P 500 + Nasdaq 100, lib/market-data/
 * significant-tickers.ts) are individually allow-listed under /stock/. These
 * are exactly the set app/api/cron/prefetch-market-data already refreshes
 * daily at 05:00 UTC regardless of crawler activity, so a crawl of this set
 * hits warm cache almost every time — near-zero incremental TwelveData cost —
 * while tryReserveOrganicCredits (lib/twelvedata/credit-budget.ts) still caps
 * any burst against the shared per-minute credit budget as a backstop. Every
 * ticker OUTSIDE this curated set stays genuinely blocked: those are cold
 * (uncached) fetches with no bound on how many a crawler could discover.
 * $ anchors each entry to the exact bare URL (no query string) so this can't
 * be used to crawl-allow an arbitrary query-stringed variant of the page.
 *
 * Note: robots.txt only steers well-behaved crawlers (Google/Bing/Meta).
 * Abuse protection lives in auth + rate limiting + caching, not here.
 */
export default function robots(): MetadataRoute.Robots {
  const allowedStockPaths = [...SIGNIFICANT_TICKERS].map((ticker) => `/stock/${ticker}$`);

  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/api/instagram/render/', ...allowedStockPaths],
      disallow: ['/api/', '/stock/', '/asset/', '/etf/', '/tools/deep-dive/', '/admin/'],
    },
    host: 'https://bullpen.no',
  };
}
