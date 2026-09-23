/**
 * Static slugs for the curated member list — the same hand-maintained pattern
 * as lib/institutions/fund-list.ts, and for the same reason: there is no admin
 * UI for a list this size, and generateStaticParams needs the slugs without a
 * network round trip.
 *
 * Must stay in sync with the seeds in supabase/migrations/149_congress_trades.sql
 * and 151_washington_traders.sql.
 */
export const CONGRESS_MEMBER_SLUGS = [
  'nancy-pelosi',
  'tommy-tuberville',
  'ro-khanna',
  'josh-gottheimer',
  'daniel-goldman',
  'diana-harshbarger',
  'lisa-mcclain',
  'sheldon-whitehouse',
  'shelley-moore-capito',
  'susan-collins',
  'mike-kelly',
  'virginia-foxx',
  'scott-peters',
  'don-beyer',
  'kevin-hern',
  'suzan-delbene',
  'judy-chu',
  'gilbert-cisneros',
  // Added in migration 151: high-volume members with positive risk-adjusted
  // returns, plus executive-branch officials with enough disclosed activity.
  'dan-sullivan',
  'tim-moore',
  'roger-marshall',
  'doug-lamborn',
  'peter-meijer',
  'trey-hollingsworth',
  'sheri-biggs',
  'kamala-harris',
  'chris-wright',
  'doug-burgum',
  'linda-mcmahon',
] as const;

export type CongressMemberSlug = (typeof CONGRESS_MEMBER_SLUGS)[number];

export function isCongressMemberSlug(slug: string): slug is CongressMemberSlug {
  return (CONGRESS_MEMBER_SLUGS as readonly string[]).includes(slug);
}

/** Filed party codes spelled out. Exported so the Discover filter labels its
 *  options the same way the cards do. */
export const PARTY_LABEL: Record<string, string> = {
  D: 'Democrat',
  R: 'Republican',
  I: 'Independent',
};

/** "Democrat · Senate · AL" — the member's position, as a card subtitle. */
export function positionLine(member: {
  party: string | null;
  chamber: string | null;
  state: string | null;
}): string {
  return [
    member.party ? (PARTY_LABEL[member.party] ?? member.party) : null,
    member.chamber,
    member.state,
  ]
    .filter(Boolean)
    .join(' · ');
}
