import type { Metadata } from 'next';
import { slugToSymbol } from '@/lib/assets/asset-type';

/**
 * Same reasoning as app/stock/[ticker]/layout.tsx: page.tsx is a client
 * component, so this sibling server layout is the only way to give each
 * crypto/commodity/forex page its own title instead of the app-wide
 * default. No database lookup here — unlike a stock ticker, the slug
 * itself (BTC-USD -> BTC/USD) is already the readable content, and a name
 * lookup would need three different data sources for the three asset
 * classes this route covers for no real gain. Also excluded from crawling
 * in robots.ts, so this is for tab titles and share links, not search.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const symbol = slugToSymbol(slug.toUpperCase());

  return {
    title: `${symbol} Price`,
    description: `Real-time price and chart for ${symbol} on BullPen.`,
  };
}

export default function AssetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
