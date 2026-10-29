import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getEconomyPage, type ResultKind } from '@/lib/market-data/economic-results';
import { ECONOMY_SLUGS } from '@/lib/market-data/economic-kinds';
import { EconomyKindClient } from '@/components/economy/EconomyKindClient';
import { SITE_URL } from '@/lib/site';

export const revalidate = 900;

const KIND_BY_SLUG = Object.fromEntries(Object.entries(ECONOMY_SLUGS).map(([kind, slug]) => [slug, kind])) as Record<string, ResultKind>;

export function generateStaticParams() {
  return Object.keys(KIND_BY_SLUG).map((kind) => ({ kind }));
}

const META: Record<ResultKind, { title: string; description: string }> = {
  fomc: {
    title: 'Fed rate decision: current federal funds rate and history',
    description: "The Federal Reserve's current target range for the federal funds rate, every change since it began setting a range in 2008, and what Fed officials project next.",
  },
  cpi: {
    title: 'CPI inflation: latest result and history',
    description: 'The latest US consumer price index: inflation over the past year and month, core inflation, and five years of history.',
  },
  pce: {
    title: 'PCE inflation: latest result and history',
    description: "The Fed's preferred inflation gauge: the latest PCE price index over the past year and month, core PCE, and five years of history.",
  },
  jobs: {
    title: 'Jobs report: latest payrolls and unemployment rate',
    description: 'How many jobs the US economy added last month, the unemployment rate, and the monthly history.',
  },
  gdp: {
    title: 'US GDP growth: latest quarter and history',
    description: 'How fast the US economy grew in the latest quarter, at an annual rate, with five years of quarterly history.',
  },
  claims: {
    title: 'Weekly jobless claims: latest and history',
    description: 'How many people filed for unemployment benefits last week, the four-week average, and two years of history.',
  },
};

export async function generateMetadata({ params }: { params: Promise<{ kind: string }> }): Promise<Metadata> {
  const { kind: slug } = await params;
  const kind = KIND_BY_SLUG[slug];
  if (!kind) return {};
  const { title, description } = META[kind];
  const url = `${SITE_URL}/tools/economy/${slug}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url } };
}

/** One release's latest result, history chart and table. Server-rendered so the numbers are in the first HTML. */
export default async function EconomyKindPage({ params }: { params: Promise<{ kind: string }> }) {
  const { kind: slug } = await params;
  const kind = KIND_BY_SLUG[slug];
  if (!kind) notFound();
  return <EconomyKindClient data={await getEconomyPage(kind)} />;
}
