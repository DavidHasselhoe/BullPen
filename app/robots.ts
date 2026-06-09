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
 * Note: robots.txt only steers well-behaved crawlers (Google/Bing). Abuse
 * protection lives in auth + rate limiting + caching, not here.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/stock/', '/asset/', '/tools/deep-dive/', '/admin/'],
    },
    host: 'https://bullpen.no',
  };
}
