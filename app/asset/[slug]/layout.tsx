import type { Metadata } from 'next';
import { slugToSymbol, findCommodity } from '@/lib/assets/asset-type';
import { getRequestLocale, getServerT } from '@/lib/i18n/server';

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
  const { slug: rawSlug } = await params;
  const slug = rawSlug.toUpperCase();
  const symbol = slugToSymbol(slug);
  const commodity = findCommodity(slug);
  // In the reader's language (middleware: cookie, else Accept-Language); a crawler sends neither and gets English.
  const t = await getServerT(await getRequestLocale(), `/asset/${slug}`);
  const name = commodity ? t(`stock:commodityName_${commodity.id}`) : symbol;
  const noun = commodity ? t(`stock:commodityNoun_${commodity.id}`) : symbol;

  return {
    title: t('stock:assetMetaTitle', { name, noun }),
    description: t(commodity ? 'stock:commodityMetaDescription' : 'stock:assetMetaDescription', { name, noun }),
    alternates: { canonical: `/asset/${slug}` },
  };
}

export default function AssetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
