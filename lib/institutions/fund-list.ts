/**
 * Static slugs for the curated fund list — single source of truth shared
 * between the drill-down page's generateStaticParams and anywhere else that
 * needs to know the tracked slugs without a network round trip. Must stay in
 * sync with the seed data in supabase/migrations/127_institutional_holdings.sql;
 * there's no admin UI to add/remove funds in v1, so this is a deliberate,
 * hand-maintained list, not a derived one.
 */
export const INSTITUTIONAL_FUND_SLUGS = [
  'berkshire-hathaway',
  'bridgewater',
  'scion-asset-mgmt',
  'pershing-square',
  'third-point',
  'duquesne-family',
  'baupost-group',
  'appaloosa',
  'renaissance-tech',
  'tiger-global',
  'ark-invest',
  'soros-fund-mgmt',
  'greenlight-capital',
  'coatue-management',
  'viking-global',
  'lone-pine-capital',
  'citadel-advisors',
] as const;

export type InstitutionalFundSlug = typeof INSTITUTIONAL_FUND_SLUGS[number];

export function isInstitutionalFundSlug(slug: string): slug is InstitutionalFundSlug {
  return (INSTITUTIONAL_FUND_SLUGS as readonly string[]).includes(slug);
}
