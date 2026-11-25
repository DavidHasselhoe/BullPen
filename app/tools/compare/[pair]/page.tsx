import type { Metadata } from 'next';
import type { TFunction } from 'i18next';
import { cache } from 'react';
import { notFound, permanentRedirect, redirect } from 'next/navigation';
import { fetchCompareCompany } from '@/lib/compare/fetch-compare-company';
import { buildVerdict } from '@/lib/compare/verdict';
import { curatedOrder, pairSlug, parsePairSlug, relatedPairs } from '@/lib/compare/popular-pairs';
import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';
import { getRequestLocale, getServerT } from '@/lib/i18n/server';
import { ToolPage, ToolBackLink } from '@/components/tools/ToolHeader';
import { CompareResults } from '@/components/tools/compare/CompareResults';

/**
 * /tools/compare/aapl-vs-msft: a head-to-head rendered on the server, so the
 * verdict and the numbers are in the HTML Google reads, under a title people
 * search ("Apple vs Microsoft"). The interactive tool's ?tickers= URLs all
 * canonicalise to the empty picker and can never rank.
 *
 * Cost: cache only (fetchCompareCompany's cacheOnly), so a crawl never spends
 * TwelveData credits. Only S&P 500 / Nasdaq 100 tickers get a page, because
 * the nightly cron keeps their statements warm; anything else, or a pair with
 * nothing cached, goes to the live tool instead of rendering a thin page.
 * Curated pairs (lib/compare/popular-pairs.ts) are indexed and in the sitemap;
 * any other pair renders for people but is noindex.
 */
const load = cache(async (a: string, b: string) => {
  const [ca, cb] = await Promise.all([
    fetchCompareCompany(a, { cacheOnly: true }).catch(() => null),
    fetchCompareCompany(b, { cacheOnly: true }).catch(() => null),
  ]);
  return ca && cb ? [ca, cb] : null;
});

type Props = { params: Promise<{ pair: string }> };

function resolve(slug: string) {
  const parsed = parsePairSlug(slug);
  if (!parsed) return null;
  const curated = curatedOrder(parsed[0], parsed[1]);
  const [a, b] = curated ?? parsed;
  return { a, b, curated: !!curated, canonical: pairSlug(a, b) };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { pair } = await params;
  const r = resolve(pair);
  if (!r) return {};
  const companies = await load(r.a, r.b);
  if (!companies) return {};
  const serverT = await getServerT(await getRequestLocale(), `/tools/compare/${r.canonical}`);
  // buildVerdict uses bare 'tools' keys; the server t defaults to 'common'.
  const t = ((key: string, opts?: Record<string, unknown>) => serverT(key, { ns: 'tools', ...opts })) as unknown as TFunction;
  const [ca, cb] = companies;
  // The description is the first two verdict lines, so every page says something only it can say.
  const facts = buildVerdict(companies, t)
    .slice(0, 2)
    .map((row) => `${row.headline}.`)
    .join(' ');
  return {
    title: t('comparePairMetaTitle', { a: ca.name, b: cb.name, ta: ca.ticker, tb: cb.ticker }),
    description: t('comparePairMetaDescription', { a: ca.name, b: cb.name, facts }),
    alternates: { canonical: `/tools/compare/${r.canonical}` },
    ...(r.curated ? {} : { robots: { index: false, follow: true } }),
  };
}

export default async function ComparePairPage({ params }: Props) {
  const { pair } = await params;
  const r = resolve(pair);
  if (!r) notFound();
  // One URL per pair: lower case, in the curated order.
  if (decodeURIComponent(pair) !== r.canonical) permanentRedirect(`/tools/compare/${r.canonical}`);
  if (!SIGNIFICANT_TICKERS.has(r.a) || !SIGNIFICANT_TICKERS.has(r.b)) redirect(`/tools/compare?tickers=${r.a},${r.b}`);

  const companies = await load(r.a, r.b);
  if (!companies) redirect(`/tools/compare?tickers=${r.a},${r.b}`);

  return (
    <ToolPage width="wide">
      <ToolBackLink />
      <CompareResults companies={companies} related={relatedPairs(r.a, r.b)} />
    </ToolPage>
  );
}
