/**
 * Static slugs for the curated fund list — single source of truth shared
 * between the drill-down page's generateStaticParams and anywhere else that
 * needs to know the tracked slugs without a network round trip. Must stay in
 * sync with the seed data in supabase/migrations/127_institutional_holdings.sql
 * (and 130, which drops three of them); there's no admin UI to add/remove
 * funds in v1, so this is a deliberate, hand-maintained list, not a derived
 * one.
 *
 * Only funds still filing 13F-HR belong here. Scion and Greenlight were
 * dropped in migration 130 because their CIKs stopped filing (2025 and 2024),
 * which left their cards permanently stamped "Outdated". Appaloosa went with
 * them and came back in migration 131 under its live CIK — the one seeded in
 * 127 was a retired entity, not a dormant manager. See both migrations for
 * the EDGAR check behind each.
 */
export const INSTITUTIONAL_FUND_SLUGS = [
  'berkshire-hathaway',
  'bridgewater',
  'pershing-square',
  'third-point',
  'duquesne-family',
  'baupost-group',
  'appaloosa',
  'renaissance-tech',
  'tiger-global',
  'ark-invest',
  'soros-fund-mgmt',
  'coatue-management',
  'viking-global',
  'lone-pine-capital',
  'citadel-advisors',
] as const;

export type InstitutionalFundSlug = typeof INSTITUTIONAL_FUND_SLUGS[number];

export function isInstitutionalFundSlug(slug: string): slug is InstitutionalFundSlug {
  return (INSTITUTIONAL_FUND_SLUGS as readonly string[]).includes(slug);
}
