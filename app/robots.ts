import type { MetadataRoute } from 'next';

/**
 * Served at /robots.txt.
 *
 * Strategy: let crawlers index the cheap, high-value marketing + content pages
 * (landing, academy, discover) for organic search reach, but keep them out of:
 *   - /api/          — internal endpoints; no reason for a crawler to hit them
 *   - /stock, /asset — per-ticker pages whose render triggers credit-costing
 *                      TwelveData fetches; not worth paying for crawl traffic (yet)
 *   - /tools/deep-dive — auth-gated + AI-cost; nothing to index
 *   - /admin          — internal/sensitive
 *
 * Exception: /api/instagram/render/ must stay crawlable — it's the image_url
 * Meta's own Instagram Graph API servers fetch when publishing a carousel
 * (see app/api/instagram/render/[postId]/[slideIndex]/route.tsx), and a
 * blanket /api/ disallow blocked that fetch outright (found via a live
 * publish attempt failing with "Only photo or video can be accepted as media
 * type" — Meta's fetcher respects robots.txt same as any other crawler). The
 * more specific allow below wins over the broader /api/ disallow per the
 * standard longest-match-wins robots.txt precedence rule.
 *
 * Note: robots.txt only steers well-behaved crawlers (Google/Bing/Meta).
 * Abuse protection lives in auth + rate limiting + caching, not here.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/api/instagram/render/'],
      disallow: ['/api/', '/stock/', '/asset/', '/tools/deep-dive/', '/admin/'],
    },
    host: 'https://bullpen.no',
  };
}
