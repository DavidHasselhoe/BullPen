import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { getDisplayNames } from '@/lib/market-data/display-names';
import { getAvailableSubpages, getDividendHistory } from '@/lib/stock/subpage-data';
import type { DividendItem } from '@/lib/twelvedata/twelvedata-client';
import { getCurrentUserId } from '@/lib/auth/server-session';
import { getRequestLocale, getServerT } from '@/lib/i18n/server';
import { NotReported, StockSubpageShell, SubpageLoadError, subpageFormat } from '@/components/stock/StockSubpageShell';

/**
 * /stock/[ticker]/dividends: every dividend in the last ~6 years, totals by
 * year, and the yield in a sentence. Server-rendered for "AAPL dividends"
 * searches; a company that pays none says so and is kept out of the index.
 * A failed load is neither: it says so and stays indexable.
 */
const load = cache(async (ticker: string) => {
  const [names, history, available] = await Promise.all([
    getDisplayNames([ticker]).catch(() => new Map<string, string>()),
    getDividendHistory(ticker).catch(() => null),
    getAvailableSubpages(ticker),
  ]);
  // A yield on record with no payments is a partial answer from TwelveData,
  // not a company that pays nothing.
  const failed = !history || (!!history.yieldPct && history.items.length === 0);
  return { name: names.get(ticker) ?? ticker, items: history?.items ?? [], yieldPct: history?.yieldPct ?? null, failed, available };
});

const same = (a: number, b: number) => Math.abs(a - b) < 1e-9;

/**
 * The most recent change to the regular dividend, or null when it can't be
 * told apart from a one-off. A change only counts if the amount before it had
 * held for two payments and the new one held for two, so a special dividend
 * (15.00 between two 1.16s) is neither a raise nor a cut. A latest payment
 * that differs from the one before is unknown yet, so nothing is said rather
 * than an older change being called the last one. Amounts are split-adjusted
 * by TwelveData (NVDA's pre-split $0.04 arrives as $0.004).
 */
function lastRegularChange(chrono: DividendItem[]): { from: number; to: number; date: string } | null {
  const n = chrono.length;
  if (n < 2 || !same(chrono[n - 1].amount, chrono[n - 2].amount)) return null;
  for (let i = n - 2; i >= 2; i--) {
    const [before2, before, at, after] = [chrono[i - 2], chrono[i - 1], chrono[i], chrono[i + 1]];
    if (!same(at.amount, before.amount) && same(before.amount, before2.amount) && same(after.amount, at.amount)) {
      return { from: before.amount, to: at.amount, date: at.ex_dividend_date };
    }
  }
  return null;
}

const FREQUENCY_KEY: Record<number, string> = {
  12: 'stock:dividendsFrequencyMonthly',
  4: 'stock:dividendsFrequencyQuarterly',
  2: 'stock:dividendsFrequencyTwice',
  1: 'stock:dividendsFrequencyYearly',
};

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const ticker = (await params).ticker.toUpperCase();
  const [{ name, items, failed }, t] = await Promise.all([load(ticker), getRequestLocale().then((l) => getServerT(l, `/stock/${ticker}`))]);
  return {
    title: t('stock:dividendsMetaTitle', { name, ticker }),
    description: t('stock:dividendsMetaDescription', { name, ticker }),
    alternates: { canonical: `/stock/${ticker}/dividends` },
    // An empty page is not worth a search result.
    ...(items.length === 0 && !failed ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function StockDividendsPage({ params }: { params: Promise<{ ticker: string }> }) {
  const ticker = (await params).ticker.toUpperCase();
  const locale = await getRequestLocale();
  const [{ name, items, yieldPct, failed, available }, t, userId] = await Promise.all([
    load(ticker),
    getServerT(locale, `/stock/${ticker}`),
    getCurrentUserId().catch(() => null),
  ]);
  const f = subpageFormat(locale);

  const sorted = [...items].sort((a, b) => b.ex_dividend_date.localeCompare(a.ex_dividend_date));
  const latest = sorted[0];
  const byYear = new Map<string, { total: number; count: number }>();
  for (const d of sorted) {
    const y = d.ex_dividend_date.slice(0, 4);
    const prev = byYear.get(y) ?? { total: 0, count: 0 };
    byYear.set(y, { total: prev.total + d.amount, count: prev.count + 1 });
  }
  // The ~6-year window usually opens mid-year, so its oldest year has fewer
  // payments than the one after and its total reads as a cut. It is left out
  // of the totals (its payments are still in "Every payment"). The current
  // year is labelled "so far" for the same reason.
  const years = [...byYear.entries()];
  const [oldest, afterOldest] = [years.at(-1), years.at(-2)];
  const partialOldest = oldest && afterOldest && oldest[1].count < afterOldest[1].count ? oldest[0] : null;
  const yearRows = years.filter(([y]) => y !== partialOldest);
  const thisYear = String(new Date().getUTCFullYear());

  // Facts only this company's history gives, so ~500 of these pages don't
  // read as one template with the rows swapped (Search Console 2026-10-15).
  const lastYear = String(Number(thisYear) - 1);
  const yearBefore = String(Number(lastYear) - 1);
  const last = byYear.get(lastYear);
  const prior = yearBefore !== partialOldest ? byYear.get(yearBefore) : undefined;
  const facts: string[] = [];
  const freqKey = last ? FREQUENCY_KEY[last.count] : undefined;
  if (freqKey) facts.push(t(freqKey, { name }));
  if (last && prior) {
    const change = (last.total - prior.total) / prior.total;
    const vars = { year: lastYear, prev: yearBefore, amount: f.perShare(last.total), change: f.pct(Math.abs(change), 0) };
    facts.push(Math.abs(change) < 0.005 ? t('stock:dividendsYearSame', vars) : t(change > 0 ? 'stock:dividendsYearUp' : 'stock:dividendsYearDown', vars));
  }
  const lastChange = lastRegularChange([...sorted].reverse());
  if (lastChange) {
    const vars = { from: f.perShare(lastChange.from), to: f.perShare(lastChange.to), date: f.monthYear(lastChange.date) };
    facts.push(t(lastChange.to > lastChange.from ? 'stock:dividendsLastRaise' : 'stock:dividendsLastCut', vars));
  }
  // TwelveData's /dividends carries no pay dates (verified 2026-10-15), so a
  // column of dashes is dropped rather than shown.
  const hasPaid = sorted.some((d) => d.payment_date);

  // The beginner's real question is "what would I get": the calculator,
  // seeded with this stock (seeding never touches a saved portfolio).
  const seed = JSON.stringify([{ ticker, name, mode: 'shares', value: '10' }]);
  const next = latest ? { href: `/tools/dividend?seed=${encodeURIComponent(seed)}`, label: t('stock:dividendsNext', { name }) } : null;

  return (
    <StockSubpageShell ticker={ticker} name={name} active="dividends" available={available} next={next} signedIn={!!userId} t={t}>
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{t('stock:dividendsH1', { name })}</h1>

      {failed ? (
        <SubpageLoadError name={name} href={`/stock/${ticker}/dividends`} t={t} />
      ) : !latest ? (
        <p className="mt-3 text-base text-foreground">{t('stock:dividendsNone', { name })}</p>
      ) : (
        <>
          <p className="mt-3 max-w-[65ch] text-pretty text-base leading-relaxed text-foreground">
            {yieldPct
              ? t('stock:dividendsSummaryYield', { name, yield: f.pct(yieldPct) })
              : null}{' '}
            {t('stock:dividendsSummaryLatest', { amount: f.perShare(latest.amount), date: f.longDate(latest.ex_dividend_date) })}{' '}
            <Link href="/glossary/dividend-yield" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">{t('stock:dividendsWhatIsYield')}</Link>
          </p>
          {facts.length > 0 && (
            <ul className="mt-4 max-w-[65ch] space-y-1.5 text-pretty text-sm leading-relaxed text-muted-foreground">
              {facts.map((fact) => <li key={fact}>{fact}</li>)}
            </ul>
          )}

          <div className="mt-10 grid gap-x-12 gap-y-10 sm:grid-cols-2">
            <section>
              <h2 id="div-by-year" className="text-lg font-semibold text-foreground">{t('stock:dividendsByYearHeading')}</h2>
              <table aria-labelledby="div-by-year" className="mt-3 w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th scope="col" className="py-2 font-medium">{t('stock:dividendsColYear')}</th>
                    <th scope="col" className="py-2 text-right font-medium">{t('stock:dividendsColTotal')}</th>
                    <th scope="col" className="py-2 text-right font-medium">{t('stock:dividendsColPayments')}</th>
                  </tr>
                </thead>
                <tbody>
                  {yearRows.map(([year, v]) => (
                    <tr key={year} className="border-b border-border/50">
                      <th scope="row" className="py-2 font-normal text-foreground">{year === thisYear ? t('stock:dividendsYearSoFar', { year }) : year}</th>
                      <td className="py-2 text-right font-mono tabular-nums">{f.perShare(v.total)}</td>
                      <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">{v.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section>
              <h2 id="div-all" className="text-lg font-semibold text-foreground">{t('stock:dividendsAllHeading')}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{t('stock:dividendsExDateHint')}</p>
              <table aria-labelledby="div-all" className="mt-3 w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th scope="col" className="py-2 font-medium">{t('stock:dividendsColExDate')}</th>
                    <th scope="col" className="py-2 text-right font-medium">{t('stock:dividendsColAmount')}</th>
                    {hasPaid && <th scope="col" className="py-2 text-right font-medium">{t('stock:dividendsColPaid')}</th>}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((d) => (
                    <tr key={d.ex_dividend_date} className="border-b border-border/50">
                      <th scope="row" className="py-2 font-normal text-foreground">{f.date(d.ex_dividend_date)}</th>
                      <td className="py-2 text-right font-mono tabular-nums">{f.perShare(d.amount)}</td>
                      {hasPaid && <td className="py-2 text-right text-muted-foreground">{d.payment_date ? f.date(d.payment_date) : <NotReported t={t} />}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>
        </>
      )}
    </StockSubpageShell>
  );
}
