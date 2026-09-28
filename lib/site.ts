/**
 * The site's public address. Canonicals, the sitemap, robots.txt, structured
 * data, email and Instagram links, and the "bullpen.no" printed on slides and
 * PDFs all read it from here.
 *
 * Moved from bullpen.no on 2026-09-28; bullpen.no 308-redirects here. Email
 * still sends from updates.bullpen.no. If this ever changes again, also set
 * NEXT_PUBLIC_APP_URL in Vercel (email and Instagram code prefer it) and
 * hand-edit public/llms.txt, content/legal/*.html and the GitHub Actions
 * APP_URL default, which can't import this.
 */
export const SITE_URL = 'https://bullpeninvest.com';

/** The bare host, for printing: "bullpeninvest.com". */
export const SITE_HOST = new URL(SITE_URL).host;
