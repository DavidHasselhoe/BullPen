/**
 * The stock subpages (dividends, congress-trades, fund-holders) for signed-out
 * English visitors, served from Vercel's CDN. Same arrangement as the stock
 * page beside it (../page.tsx): middleware.ts rewrites /stock/<ticker>/<subpage>
 * here and redirects any direct request back.
 *
 * Why: crawlers walk ~520 tickers x 3 subpages, and each render made ~8
 * database calls on a Supabase Nano instance that swaps under that load
 * (2026-11-15: requests queued 15-90s in crawl bursts). The data behind these
 * pages changes daily at most, so a guest copy rendered once per REVALIDATE
 * window loses nothing. A signed-in reader still gets the per-request page,
 * which is the only one that can show Pro values.
 */

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Dividends, { generateMetadata as dividendsMeta } from '@/app/stock/[ticker]/dividends/page';
import CongressTrades, { generateMetadata as congressMeta } from '@/app/stock/[ticker]/congress-trades/page';
import FundHolders, { generateMetadata as fundsMeta } from '@/app/stock/[ticker]/fund-holders/page';
import { NamespaceBundle } from '@/components/i18n/NamespaceBundle';
import watchlistEn from '@/lib/i18n/locales/en/watchlist.json';

export const dynamic = 'force-static';
export const revalidate = 21600;

const PAGES = {
  dividends: [Dividends, dividendsMeta],
  'congress-trades': [CongressTrades, congressMeta],
  'fund-holders': [FundHolders, fundsMeta],
} as const;

type Params = Promise<{ ticker: string; subpage: string }>;

const pick = (subpage: string) => PAGES[subpage as keyof typeof PAGES] ?? notFound();

/** Empty: every ticker renders on first visit, as on the stock page. */
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const p = await params;
  return pick(p.subpage)[1]({ params: Promise.resolve(p) });
}

export default async function CachedStockSubpage({ params }: { params: Params }) {
  const p = await params;
  const Page = pick(p.subpage)[0];
  // The Watch button renders on first paint; force-static leaves the layout unable to preload 'watchlist'.
  return (
    <NamespaceBundle locale="en" ns="watchlist" resources={watchlistEn}>
      <Page params={Promise.resolve(p)} requireData />
    </NamespaceBundle>
  );
}
