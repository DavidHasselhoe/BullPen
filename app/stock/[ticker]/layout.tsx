import type { Metadata } from 'next';
import { getDisplayNames } from '@/lib/market-data/display-names';

/**
 * The page itself (page.tsx) is a client component, which can't export
 * generateMetadata — this sibling server layout is the minimal way to give
 * every stock page its own title/description instead of the app-wide
 * default. Most of /stock/* is excluded from crawling in robots.ts (live,
 * credit-costing data isn't worth paying for uncapped crawl traffic on), but
 * the curated SIGNIFICANT_TICKERS set (S&P 500 + Nasdaq 100) is explicitly
 * allow-listed there — this metadata, including the canonical tag below, is
 * genuine search-ranking value for that set and tab-title/share quality for
 * everyone else.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker: rawTicker } = await params;
  const ticker = rawTicker.toUpperCase();

  // Properly cased ("Texas Instruments"), not the SEC's "TEXAS INSTRUMENTS INC".
  const name = (await getDisplayNames([ticker])).get(ticker);
  const title = name ? `${name} (${ticker}) Stock Price` : `${ticker} Stock Price`;
  const description = name
    ? `Real-time price, financials, and AI-powered analysis for ${name} (${ticker}) on BullPen.`
    : `Real-time price, financials, and AI-powered analysis for ${ticker} on BullPen.`;

  return { title, description, alternates: { canonical: `/stock/${ticker}` } };
}

export default function StockLayout({ children }: { children: React.ReactNode }) {
  return children;
}
