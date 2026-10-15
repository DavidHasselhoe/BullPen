import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { getDisplayNames } from '@/lib/market-data/display-names';
import { getDividendHistory } from '@/lib/stock/subpage-data';
import type { DividendItem } from '@/lib/twelvedata/twelvedata-client';
import { getRequestLocale, getServerT } from '@/lib/i18n/server';
import { StockSubpageShell, subpageFormat } from '@/components/stock/StockSubpageShell';

/**
 * /stock/[ticker]/dividends: every dividend in the last ~6 years, totals by
 * year, and the yield in a sentence. Server-rendered for "AAPL dividends"
 * searches; a company that pays none says so and is kept out of the index.
 */
const load = cache(async (ticker: string) => {
  const [names, history] = await Promise.all([
    getDisplayNames([ticker]).catch(() => new Map<string, string>()),
    getDividendHistory(ticker).catch(() => ({ items: [], yieldPct: null })),
  ]);
  return { name: names.get(ticker) ?? ticker, ...history };
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
  const [{ name, items }, t] = await Promise.all([load(ticker), getRequestLocale().then((l) => getServerT(l, `/stock/${ticker}`))]);
  return {
    title: t('stock:dividendsMetaTitle', { name, ticker }),
    description: t('stock:dividendsMetaDescription', { name, ticker }),
    alternates: { canonical: `/stock/${ticker}/dividends` },
    // An empty page is not worth a search result.
    ...(items.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function StockDividendsPage({ params }: { params: Promise<{ ticker: string }> }) {
  const ticker = (await params).ticker.toUpperCase();
  const locale = await getRequestLocale();
  const [{ name, items, yieldPct }, t] = await Promise.all([load(ticker), getServerT(locale, `/stock/${ticker}`)]);
  const f = subpageFormat(locale);

  const sorted = [...items].sort((a, b) => b.ex_dividend_date.localeCompare(a.ex_dividend_date));
  const latest = sorted[0];
  const byYear = new Map<string, { total: number; count: number }>();
  for (const d of sorted) {
    const y = d.ex_dividend_date.slice(0, 4);
    const prev = byYear.get(y) ?? { total: 0, count: 0 };
    byYear.set(y, { total: prev.total + d.amount, count: prev.count + 1 });
  }
  const money = (v: number) => f.usd(v, v < 0.1 ? 4 : 2);

  // Facts only this company's history gives, so ~500 of these pages don't
  // read as one template with the rows swapped (Search Console 2026-10-15).
  const lastYear = String(new Date().getUTCFullYear() - 1);
  const yearBefore = String(Number(lastYear) - 1);
  const last = byYear.get(lastYear);
  const prior = byYear.get(yearBefore);
  const facts: string[] = [];
  const freqKey = last ? FREQUENCY_KEY[last.count] : undefined;
  if (freqKey) facts.push(t(freqKey, { name }));
  if (last && prior) {
    const change = (last.total - prior.total) / prior.total;
    const vars = { year: lastYear, prev: yearBefore, amount: money(last.total), change: f.pct(Math.abs(change), 0) };
    facts.push(Math.abs(change) < 0.005 ? t('stock:dividendsYearSame', vars) : t(change > 0 ? 'stock:dividendsYearUp' : 'stock:dividendsYearDown', vars));
  }
  const lastChange = lastRegularChange([...sorted].reverse());
  if (lastChange) {
    const vars = { from: money(lastChange.from), to: money(lastChange.to), date: f.monthYear(lastChange.date) };
    facts.push(t(lastChange.to > lastChange.from ? 'stock:dividendsLastRaise' : 'stock:dividendsLastCut', vars));
  }
  // TwelveData's /dividends carries no pay dates (verified 2026-10-15), so a
  // column of dashes is dropped rather than shown.
  const hasPaid = sorted.some((d) => d.payment_date);

  return (
    <StockSubpageShell ticker={ticker} name={name} active="dividends" t={t}>
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{t('stock:dividendsH1', { name })}</h1>

      {!latest ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('stock:dividendsNone', { name })}</p>
      ) : (
        <>
          <p className="mt-3 max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">
            {yieldPct
              ? t('stock:dividendsSummaryYield', { name, yield: f.pct(yieldPct) })
              : null}{' '}
            {t('stock:dividendsSummaryLatest', { amount: f.usd(latest.amount, latest.amount < 0.1 ? 4 : 2), date: f.longDate(latest.ex_dividend_date) })}{' '}
            <Link href="/glossary/dividend-yield" className="underline underline-offset-4 hover:text-foreground">{t('stock:dividendsWhatIsYield')}</Link>
          </p>
          {facts.length > 0 && (
            <p className="mt-3 max-w-3xl text-pretty text-sm leading-relaxed text-foreground">{facts.join(' ')}</p>
          )}

          <h2 className="mt-10 text-lg font-semibold text-foreground">{t('stock:dividendsByYearHeading')}</h2>
          <table className="mt-3 w-full max-w-md text-left text-sm">
            <thead>
              <tr className="border-b text-xs text-muted-foreground">
                <th scope="col" className="py-2 font-medium">{t('stock:dividendsColYear')}</th>
                <th scope="col" className="py-2 text-right font-medium">{t('stock:dividendsColTotal')}</th>
                <th scope="col" className="py-2 text-right font-medium">{t('stock:dividendsColPayments')}</th>
              </tr>
            </thead>
            <tbody>
              {[...byYear.entries()].map(([year, v]) => (
                <tr key={year} className="border-b border-border/50">
                  <th scope="row" className="py-2 font-normal text-foreground">{year}</th>
                  <td className="py-2 text-right font-mono tabular-nums">{f.usd(v.total, v.total < 0.1 ? 4 : 2)}</td>
                  <td className="py-2 text-right font-mono tabular-nums text-muted-foreground">{v.count}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2 className="mt-10 text-lg font-semibold text-foreground">{t('stock:dividendsAllHeading')}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{t('stock:dividendsExDateHint')}</p>
          <table className="mt-3 w-full text-left text-sm">
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
                  <td className="py-2 text-right font-mono tabular-nums">{f.usd(d.amount, d.amount < 0.1 ? 4 : 2)}</td>
                  {hasPaid && <td className="py-2 text-right text-muted-foreground">{d.payment_date ? f.date(d.payment_date) : '–'}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </StockSubpageShell>
  );
}
