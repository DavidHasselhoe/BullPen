/**
 * The site's public address. Canonicals, the sitemap, robots.txt, structured
 * data, email and Instagram links, and the "bullpen.no" printed on slides and
 * PDFs all read it from here.
 *
 * Domain move to bullpeninvest.com: change SITE_URL, set NEXT_PUBLIC_APP_URL
 * to the same value in Vercel (email and Instagram code prefer the env var),
 * and follow the switch checklist in the memory note project-domain-migration.
 * public/llms.txt, content/legal/*.html and the GitHub Actions APP_URL default
 * are static and are edited by hand on the day.
 */
export const SITE_URL = 'https://bullpen.no';

/** The bare host, for printing: "bullpen.no". */
export const SITE_HOST = new URL(SITE_URL).host;
