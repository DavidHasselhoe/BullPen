// The roster lives in congress_politicians.is_active, not in code. A second
// hand-kept slug list drifted from it: Trump (added in migration 155) 404ed
// while the 10 members deactivated in 154 still resolved to a broken page.

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
