import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/client';
import { INSTITUTIONAL_FUND_SLUGS, isInstitutionalFundSlug } from '@/lib/institutions/fund-list';
import { InstitutionalFundDetailClient } from '@/components/institutions/InstitutionalFundDetailClient';

const BASE_URL = 'https://bullpen.no';

export function generateStaticParams() {
  return INSTITUTIONAL_FUND_SLUGS.map((slug) => ({ 'fund-slug': slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ 'fund-slug': string }>;
}): Promise<Metadata> {
  const { 'fund-slug': slug } = await params;
  if (!isInstitutionalFundSlug(slug)) return {};

  const supabase = createServerClient();
  const { data: fund } = await supabase
    .from('institutional_investors')
    .select('display_name, manager_name')
    .eq('slug', slug)
    .maybeSingle<{ display_name: string; manager_name: string | null }>();

  const displayName = fund?.display_name ?? slug.replace(/-/g, ' ');
  const title = `${displayName} 13F holdings | BullPen`;
  const description = fund?.manager_name
    ? `${displayName}'s quarterly SEC 13F holdings, run by ${fund.manager_name} — tracked and updated every quarter.`
    : `${displayName}'s quarterly SEC 13F holdings, tracked and updated every quarter.`;
  return {
    title,
    description,
    alternates: { canonical: `${BASE_URL}/discover/institutions/${slug}` },
    openGraph: { title, description, url: `${BASE_URL}/discover/institutions/${slug}` },
  };
}

export default async function InstitutionalFundPage({
  params,
}: {
  params: Promise<{ 'fund-slug': string }>;
}) {
  const { 'fund-slug': slug } = await params;
  if (!isInstitutionalFundSlug(slug)) notFound();

  // Same container as /discover (its page.tsx) — without it this page rendered
  // edge to edge, stretching the holdings bars to ~2000px on a wide screen,
  // where neither the bar lengths nor a row's ticker and its percentage could
  // be compared without crossing the whole viewport.
  return (
    <main className="container mx-auto max-w-6xl py-8 px-4 sm:px-6 lg:px-8 min-w-0 page-enter">
      <InstitutionalFundDetailClient slug={slug} />
    </main>
  );
}
