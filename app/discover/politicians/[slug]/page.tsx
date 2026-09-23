import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/client';
import { CONGRESS_MEMBER_SLUGS, isCongressMemberSlug, positionLine } from '@/lib/congress/member-list';
import { CongressMemberDetailClient } from '@/components/congress/CongressMemberDetailClient';

const BASE_URL = 'https://bullpen.no';

export function generateStaticParams() {
  return CONGRESS_MEMBER_SLUGS.map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  if (!isCongressMemberSlug(slug)) return {};

  const supabase = createServerClient();
  const { data: member } = await supabase
    .from('congress_politicians')
    .select('display_name, party, state, chamber')
    .eq('slug', slug)
    .maybeSingle<{
      display_name: string;
      party: string | null;
      state: string | null;
      chamber: string | null;
    }>();

  const displayName = member?.display_name ?? slug.replace(/-/g, ' ');
  const title = `${displayName} stock trades | BullPen`;
  const position = member ? positionLine(member) : null;
  // Not "under the STOCK Act": that statute covers Congress, and this route
  // also serves executive-branch officials, who file under the Ethics in
  // Government Act instead.
  const description = position
    ? `Stock trades disclosed by ${displayName} (${position}) under federal financial disclosure rules, with filing dates and reported amount ranges.`
    : `Stock trades disclosed by ${displayName} under federal financial disclosure rules, with filing dates and reported amount ranges.`;

  return {
    title,
    description,
    alternates: { canonical: `${BASE_URL}/discover/politicians/${slug}` },
    openGraph: { title, description, url: `${BASE_URL}/discover/politicians/${slug}` },
  };
}

export default async function CongressMemberPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!isCongressMemberSlug(slug)) notFound();

  // Same container as /discover and the 13F fund page — without it the
  // allocation rows stretch across the full viewport on a wide screen.
  return (
    <main className="container mx-auto max-w-6xl py-8 px-4 sm:px-6 lg:px-8 min-w-0">
      <CongressMemberDetailClient slug={slug} />
    </main>
  );
}
