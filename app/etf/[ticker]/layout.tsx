import type { Metadata } from 'next';
import { getIndexedKind } from '@/lib/search/refresh-index';

/**
 * page.tsx is a client component, which can't export generateMetadata — same
 * reasoning as app/stock/[ticker]/layout.tsx and app/asset/[slug]/layout.tsx.
 * This route had NO metadata at all until now (not even a title), and unlike
 * those two siblings it also had no robots.ts entry — ETF tickers aren't in
 * the `companies` table (confirmed: no row for SPY/QQQ/VOO/VTI), so there's
 * no name lookup to do here, and /etf/ is now blocked in robots.ts alongside
 * /stock/ and /asset/ for the same reason: an unbounded per-ticker route
 * whose render costs TwelveData credits has no business being open to
 * unlimited crawl discovery. No curated allow-list here yet (unlike /stock/'s
 * SIGNIFICANT_TICKERS carve-out) — there's no existing "significant ETFs"
 * list to reuse, so this stays fully blocked until one is built.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker: rawTicker } = await params;
  const ticker = rawTicker.toUpperCase();

  // This route serves index funds as well as ETFs, and calling a Vanguard fund
  // an ETF in the browser tab is the same small lie as doing it on the page.
  const noun = (await getIndexedKind(ticker)) === 'f' ? 'Index Fund' : 'ETF';

  return {
    title: `${ticker} ${noun} Price`,
    description: `Real-time price, chart and key numbers for the ${ticker} ${noun.toLowerCase()} on BullPen.`,
    alternates: { canonical: `/etf/${ticker}` },
  };
}

export default function EtfLayout({ children }: { children: React.ReactNode }) {
  return children;
}
