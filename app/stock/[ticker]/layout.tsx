import type { Metadata } from 'next';
import { getDisplayNames } from '@/lib/market-data/display-names';
import { getRequestLocale, getServerT } from '@/lib/i18n/server';

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
  // In the reader's language (middleware: cookie, else Accept-Language), as the
  // subpages already were; a crawler sends neither and gets English.
  const [names, t] = await Promise.all([
    getDisplayNames([ticker]),
    getRequestLocale().then((l) => getServerT(l, `/stock/${ticker}`)),
  ]);
  const name = names.get(ticker);
  const title = name ? t('stock:stockMetaTitle', { name, ticker }) : t('stock:stockMetaTitleTicker', { ticker });
  const description = name
    ? t('stock:stockMetaDescription', { name, ticker })
    : t('stock:stockMetaDescriptionTicker', { ticker });

  // A plain string title here would stop the root "%s | BullPen" template at
  // this segment, so the subpages (dividends, congress-trades, fund-holders)
  // shipped without the brand; the template is restated for them.
  return { title: { default: title, template: '%s | BullPen' }, description, alternates: { canonical: `/stock/${ticker}` } };
}

export default function StockLayout({ children }: { children: React.ReactNode }) {
  return children;
}
