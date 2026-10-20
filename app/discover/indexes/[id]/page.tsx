import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase/client';
import { isIndexScope, loadScreenerUniverse } from '@/lib/screener/screener-query';
import { INDEX_IDS, getIndexWeights, getRecentIndexEvents, indexChangeWeekOf } from '@/lib/market-data/index-events';
import type { IndexId } from '@/lib/market-data/index-membership';
import { IndexDetailClient } from '@/components/discover/v2/IndexDetailClient';
import { SITE_URL } from '@/lib/site';

// Membership changes weekly, weights once a sync, screener_stats daily.
export const revalidate = 3600;

export function generateStaticParams() {
  return INDEX_IDS.map((id) => ({ id }));
}

const META: Record<IndexId, { title: string; description: string }> = {
  sp500: {
    title: 'S&P 500 companies, by size',
    description: 'Every company in the S&P 500, largest first, with how much of the index each one is. Updated weekly.',
  },
  nasdaq100: {
    title: 'Nasdaq-100 companies, by size',
    description: 'Every company in the Nasdaq-100, largest first, with its price, valuation and dividend. Updated weekly.',
  },
  dow30: {
    title: 'Dow Jones 30 companies',
    description: 'All 30 companies in the Dow Jones Industrial Average, with how much of the index each one is. Updated weekly.',
  },
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!isIndexScope(id)) return {};
  const { title, description } = META[id];
  const url = `${SITE_URL}/discover/indexes/${id}`;
  return { title, description, alternates: { canonical: url }, openGraph: { title, description, url } };
}

/**
 * One index's constituents as a sortable table, largest first. Rendered on the
 * server so every company is in the first HTML (search engines read the list,
 * not a spinner). No prices, see COLUMN_KEYS in IndexDetailClient.
 */
export default async function IndexPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isIndexScope(id)) notFound();

  const [universe, weights, events] = await Promise.all([
    loadScreenerUniverse(createServerClient(), { scope: id }),
    getIndexWeights(id),
    getRecentIndexEvents(id, 180),
  ]);
  const changes = events.map((e) => ({ ticker: e.ticker, change: e.change, weekOf: indexChangeWeekOf(e.detectedOn) }));
  return <IndexDetailClient id={id} rows={universe.rows} weights={weights} events={changes} />;
}
