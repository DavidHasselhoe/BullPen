/**
 * Filing-lag disclaimer for congressional and executive-branch disclosures.
 *
 * One shared component for both placements (the Discover section teaser and
 * the member page above the trades) so the copy cannot drift between them —
 * the same reason Filing13FDisclaimer exists for the 13F side. Rendered
 * inline rather than in a footer: it belongs where the data is actually being
 * read, and the member pages are publicly crawlable, so a reader can arrive
 * on one without ever passing the Discover section.
 */
export function DisclosureNote({ compact = false }: { compact?: boolean }) {
  if (compact) {
    return (
      <p className="text-xs leading-relaxed text-muted-foreground">
        Filed within 45 days of the trade, so this is a record of what was reported, not a live
        feed. Amounts are the ranges disclosure rules require, not exact figures.
      </p>
    );
  }

  return (
    <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
      Stock trades disclosed by members of Congress and senior executive-branch officials under
      federal financial disclosure rules. They file within 45 days of trading, so this is a record
      of what was reported, not a live feed. Amounts are the ranges those rules require, not exact
      figures.
    </p>
  );
}
