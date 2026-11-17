import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { INSTITUTIONAL_FUND_SLUGS, isInstitutionalFundSlug } from '@/lib/institutions/fund-list';
import { InstitutionalFundDetailClient } from '@/components/institutions/InstitutionalFundDetailClient';
import { loadFundSummaries } from '@/lib/institutions/fund-summaries';
import { buildFundTeaser } from '@/lib/institutions/fund-teaser';
import { freeLatestView, loadFundHoldings, SSR_MAX_POSITIONS } from '@/lib/institutions/load-holdings';
import { buildAllocation, friendlyIssuerName } from '@/lib/institutions/allocation';
import { fmtUsd, quarterLabel } from '@/lib/institutions/format';
import { getRequestLocale } from '@/lib/i18n/server';

import { SITE_URL } from '@/lib/site';
const BASE_URL = SITE_URL;

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

  // Cached for 12h (load-holdings.ts), and the page body reads the same entry.
  const result = await loadFundHoldings(slug, null).catch(() => null);
  const data = result?.ok ? result.data : null;
  const displayName = data?.fund.displayName ?? slug.replace(/-/g, ' ');
  const canonical = `${BASE_URL}/discover/institutions/${slug}`;

  if (!data) {
    const title = `${displayName} 13F holdings | BullPen`;
    const description = `${displayName}'s quarterly SEC 13F holdings, tracked and updated every quarter.`;
    return { title, description, alternates: { canonical }, openGraph: { title, description, url: canonical } };
  }

  // The search is "<fund> 13f": name the quarter and what the filing holds,
  // so the result reads as the answer rather than as a page about the fund.
  const quarter = quarterLabel(data.filing.periodOfReport);
  const top = buildAllocation(data.holdings).top.slice(0, 3)
    .map((h) => h.symbol ?? friendlyIssuerName(h.name));
  const size = data.filing.totalValueUsd ? `${fmtUsd(data.filing.totalValueUsd)} across ` : '';
  const title = `${displayName} 13F holdings (${quarter}) | BullPen`;
  const description =
    `${displayName}'s latest 13F for ${quarter}: ${size}${data.filing.totalPositions ?? data.holdings.length} positions` +
    `${top.length ? `, led by ${top.join(', ')}` : ''}.` +
    `${data.fund.managerName ? ` Run by ${data.fund.managerName}.` : ''} Every holding, sized by weight.`;
  return { title, description, alternates: { canonical }, openGraph: { title, description, url: canonical } };
}

export default async function InstitutionalFundPage({
  params,
}: {
  params: Promise<{ 'fund-slug': string }>;
}) {
  const { 'fund-slug': slug } = await params;
  if (!isInstitutionalFundSlug(slug)) notFound();

  // The header and the free latest quarter, rendered on the server for
  // crawlers and signed-out visitors. A signed-in visitor (same sb- cookie
  // test as middleware.ts) may be Pro, so their page loads in the browser as
  // before, and so does any failed read.
  const signedIn = (await cookies()).getAll().some((c) => c.name.startsWith('sb-'));
  const lang = await getRequestLocale();
  const [funds, teaser, holdings] = await Promise.all([
    loadFundSummaries().catch(() => undefined),
    signedIn ? null : buildFundTeaser(slug, lang).catch(() => null),
    signedIn ? null : loadFundHoldings(slug, null).catch(() => null),
  ]);
  const initialHoldings =
    holdings?.ok && (holdings.data.filing.totalPositions ?? holdings.data.holdings.length) <= SSR_MAX_POSITIONS
      ? freeLatestView(holdings.data)
      : undefined;

  // Same container as /discover (its page.tsx) — without it this page rendered
  // edge to edge, stretching the holdings bars to ~2000px on a wide screen,
  // where neither the bar lengths nor a row's ticker and its percentage could
  // be compared without crossing the whole viewport.
  return (
    <main className="container mx-auto max-w-6xl py-8 px-4 sm:px-6 lg:px-8 min-w-0">
      <InstitutionalFundDetailClient
        slug={slug}
        initialFunds={funds}
        initialTeaser={teaser?.ok ? { lang, teaser: teaser.teaser } : undefined}
        initialHoldings={initialHoldings}
      />
    </main>
  );
}
