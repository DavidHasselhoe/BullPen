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

/** "Democrat · Senate · AL" — the member's position, as a card subtitle.
 *  Pass the 'discover' t to translate party and chamber; without it (server
 *  metadata) the line stays English. */
export function positionLine(
  member: { party: string | null; chamber: string | null; state: string | null },
  t?: (key: string, opts: { defaultValue: string }) => string,
): string {
  const party = member.party ? (PARTY_LABEL[member.party] ?? member.party) : null;
  return [
    party && t ? t(`congParty_${member.party}`, { defaultValue: party }) : party,
    member.chamber && t ? t(`congChamber_${member.chamber}`, { defaultValue: member.chamber }) : member.chamber,
    member.state,
  ]
    .filter(Boolean)
    .join(' · ');
}
