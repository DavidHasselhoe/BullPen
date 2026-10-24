import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { positionLine } from '@/lib/congress/member-list';
import { loadCongressMember, loadCongressMembers, MIN_MEMBER_TRADES } from '@/lib/congress/member-data';
import { CongressMemberDetailClient } from '@/components/congress/CongressMemberDetailClient';

import { SITE_URL } from '@/lib/site';
const BASE_URL = SITE_URL;

/**
 * The roster is congress_politicians.is_active, so that is what decides
 * whether this page exists (loadCongressMember returns null otherwise).
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const member = await loadCongressMember(slug).catch(() => null);
  if (!member) return {};

  const displayName = member.displayName;
  const title = `${displayName} stock trades | BullPen`;
  const position = positionLine(member);
  // Not "under the STOCK Act": that statute covers Congress, and this route
  // also serves executive-branch officials, who file under the Ethics in
  // Government Act instead.
  const description = position
    ? `Stock trades disclosed by ${displayName} (${position}) under federal financial disclosure rules, with filing dates and reported amount ranges.`
    : `Stock trades disclosed by ${displayName} under federal financial disclosure rules, with filing dates and reported amount ranges.`;

  // Thin pages stay linked but out of the index, on the same count the
  // sitemap uses (the member list's tradeCount), so the two can't disagree.
  const tradeCount = (await loadCongressMembers().catch(() => [])).find((m) => m.slug === slug)?.tradeCount ?? 0;

  return {
    title,
    description,
    alternates: { canonical: `${BASE_URL}/discover/politicians/${slug}` },
    openGraph: { title, description, url: `${BASE_URL}/discover/politicians/${slug}` },
    ...(tradeCount < MIN_MEMBER_TRADES ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function CongressMemberPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  // A failed read still renders the page, which then loads in the browser as before.
  const member = await loadCongressMember(slug).catch(() => undefined);
  if (member === null) notFound();

  // Same container as /discover and the 13F fund page — without it the
  // allocation rows stretch across the full viewport on a wide screen.
  return (
    <main className="container mx-auto max-w-6xl py-8 px-4 sm:px-6 lg:px-8 min-w-0">
      <CongressMemberDetailClient slug={slug} initialMember={member} />
    </main>
  );
}
