import Link from 'next/link';
import type { TFunction } from 'i18next';
import type { StockSnapshot } from '@/lib/stock/snapshot';

/**
 * "{Company} at a glance": a short plain-English read of the key numbers,
 * rendered on the server.
 *
 * Every section above it on the stock page renders in the browser only
 * (dynamic, ssr: false), so the HTML a search engine fetches had ~49 words:
 * nav, section names, nothing about the company. This gives each page real,
 * per-ticker content in its first response, from the snapshot the page
 * already fetches (no extra data calls), and gives a beginner the numbers in
 * a sentence with a link to what each one means.
 *
 * Every figure is the snapshot's own; a missing one is left out, never filled.
 */
interface Props {
  ticker: string;
  name: string;
  snapshot: StockSnapshot;
  locale: string;
  t: TFunction;
}

function num(v: unknown): number | null {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

export function StockGlance({ ticker, name, snapshot, locale, t }: Props) {
  const s = (snapshot.statistics ?? {}) as Record<string, unknown>;
  const price = snapshot.quote?.price ?? null;
  const marketCap = num(s.marketCap);
  const pe = num(s.peRatioTTM);
  const dividendYield = num(s.dividendYield);
  const high = num(s.week52High);
  const low = num(s.week52Low);
  const margin = num(s.profitMargin);
  const growth = num(s.revenueGrowthTTM);
  const beta = num(s.beta);

  if (price == null && marketCap == null) return null;

  const usd = (v: number, digits = 2) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: digits, minimumFractionDigits: digits }).format(v);
  // "$4.9T" in the fact list; spelled out ("$4.9 trillion") in a sentence, where
  // a beginner shouldn't have to decode the suffix. Currency style ignores
  // compactDisplay: 'long', hence the $ by hand.
  const bigUsd = (v: number) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(v);
  const bigUsdWords = (v: number) =>
    `$${new Intl.NumberFormat(locale, { notation: 'compact', compactDisplay: 'long', maximumFractionDigits: 1 }).format(v)}`;
  const pct = (v: number) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 1 }).format(v);
  const plain = (v: number, digits = 1) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(v);

  const sentences: string[] = [];
  if (marketCap != null && price != null) sentences.push(t('stock:glanceWorthAndPrice', { name, ticker, marketCap: bigUsdWords(marketCap), price: usd(price) }));
  else if (price != null) sentences.push(t('stock:glancePrice', { name, ticker, price: usd(price) }));
  if (pe != null && pe > 0) sentences.push(t('stock:glancePe', { pe: plain(pe) }));
  if (low != null && high != null) sentences.push(t('stock:glanceRange', { low: usd(low), high: usd(high) }));
  if (margin != null && growth != null) sentences.push(t('stock:glanceMarginGrowth', { margin: pct(margin), growth: pct(growth) }));
  else if (margin != null) sentences.push(t('stock:glanceMargin', { margin: pct(margin) }));
  if (dividendYield != null) {
    sentences.push(dividendYield > 0 ? t('stock:glanceDividend', { yield: pct(dividendYield) }) : t('stock:glanceNoDividend'));
  }

  // Each label links to the glossary term that explains it.
  const facts: Array<{ label: string; slug: string; value: string }> = [];
  if (marketCap != null) facts.push({ label: t('stock:glanceFactMarketCap'), slug: 'market-cap', value: bigUsd(marketCap) });
  if (pe != null && pe > 0) facts.push({ label: t('stock:glanceFactPe'), slug: 'p-e-ttm', value: plain(pe) });
  if (dividendYield != null) facts.push({ label: t('stock:glanceFactDividendYield'), slug: 'dividend-yield', value: pct(dividendYield) });
  if (low != null && high != null) facts.push({ label: t('stock:glanceFactRange'), slug: '52w-range', value: `${usd(low)} – ${usd(high)}` });
  if (margin != null) facts.push({ label: t('stock:glanceFactMargin'), slug: 'profit-margin', value: pct(margin) });
  if (beta != null) facts.push({ label: t('stock:glanceFactBeta'), slug: 'beta', value: plain(beta, 2) });

  const asOf = snapshot.statsFetchedAt
    ? new Date(snapshot.statsFetchedAt).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

  return (
    <section aria-labelledby="stock-glance-heading" className="mt-12 border-t border-border/50 pt-8">
      <h2 id="stock-glance-heading" className="text-lg font-semibold tracking-tight text-foreground">
        {t('stock:glanceHeading', { name })}
      </h2>
      {sentences.length > 0 && (
        <p className="mt-3 max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">{sentences.join(' ')}</p>
      )}
      {facts.length > 0 && (
        <dl className="mt-5 grid max-w-3xl grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
          {facts.map((f) => (
            <div key={f.slug}>
              <dt className="text-xs text-muted-foreground">
                <Link href={`/glossary/${f.slug}`} className="underline decoration-muted-foreground/40 underline-offset-4 hover:text-foreground">
                  {f.label}
                </Link>
              </dt>
              <dd className="mt-0.5 font-mono text-sm tabular-nums text-foreground">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        {asOf ? t('stock:glanceAsOf', { date: asOf }) : null} {t('stock:glanceNotAdvice')}
      </p>
    </section>
  );
}
