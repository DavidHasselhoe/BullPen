import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { getDisplayNames } from '@/lib/market-data/display-names';
import { getAvailableSubpages, getCongressTrades } from '@/lib/stock/subpage-data';
import { positionLine } from '@/lib/congress/member-list';
import { getCurrentUserId } from '@/lib/auth/server-session';
import { getRequestLocale, getServerT } from '@/lib/i18n/server';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { NotReported, StockSubpageShell, SubpageLoadError, subpageFormat } from '@/components/stock/StockSubpageShell';
import { ExpandableTable } from '@/components/stock/SubpageIslands';

/**
 * /stock/[ticker]/congress-trades: every trade in this stock that a member of
 * Congress has reported, newest first. Server-rendered for "who in Congress
 * owns NVDA" searches. Washington Trading data is free in the app, so it is
 * all shown here too.
 */
const load = cache(async (ticker: string) => {
  const [names, trades, available] = await Promise.all([
    getDisplayNames([ticker]).catch(() => new Map<string, string>()),
    getCongressTrades(ticker).catch(() => null),
    getAvailableSubpages(ticker),
  ]);
  const yearAgo = new Date(Date.now() - 365 * 86400_000).toISOString().slice(0, 10);
  return { name: names.get(ticker) ?? ticker, trades: trades ?? [], failed: !trades, available, yearAgo };
});

const isBuy = (type: string) => /purchase|buy/i.test(type);
const isSell = (type: string) => /sale|sell/i.test(type);

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const ticker = (await params).ticker.toUpperCase();
  const [{ name, trades, failed }, t] = await Promise.all([load(ticker), getRequestLocale().then((l) => getServerT(l, `/stock/${ticker}`))]);
  return {
    title: t('stock:congressMetaTitle', { name, ticker }),
    description: t('stock:congressMetaDescription', { name, ticker }),
    alternates: { canonical: `/stock/${ticker}/congress-trades` },
    ...(trades.length === 0 && !failed ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function StockCongressTradesPage({ params }: { params: Promise<{ ticker: string }> }) {
  const ticker = (await params).ticker.toUpperCase();
  const locale = await getRequestLocale();
  // Party and chamber names live in Discover's namespace, beside the member pages.
  const [{ name, trades, failed, available, yearAgo }, t, td, userId] = await Promise.all([
    load(ticker),
    getServerT(locale, `/stock/${ticker}`),
    getServerT(locale, '/discover'),
    getCurrentUserId().catch(() => null),
  ]);
  const f = subpageFormat(locale);
  const position = (p: { party: string | null; chamber: string | null; state: string | null }) =>
    positionLine(p, (key, opts) => td(`discover:${key}`, opts));
  const typeLabel = (type: string) =>
    isBuy(type) ? t('stock:congressBuy') : isSell(type) ? t('stock:congressSell') : /exchange/i.test(type) ? t('stock:congressExchange') : t('stock:congressOther');

  const members = new Set(trades.map((tr) => tr.politician.slug));
  const buys = trades.filter((tr) => isBuy(tr.tradeType)).length;
  const sells = trades.filter((tr) => isSell(tr.tradeType)).length;
  const earliest = trades.reduce<string | null>((min, tr) => (tr.transactionDate && (!min || tr.transactionDate < min) ? tr.transactionDate : min), null);

  // Facts only this stock's trades give, so ~500 of these pages don't read as
  // one template with the rows swapped (Search Console 2026-10-15). Buys and
  // sells are counted, not weighed: amounts are filed as ranges, so the copy
  // says "by number of trades".
  const facts: string[] = [];
  if (buys > sells) facts.push(t('stock:congressMoreBuys', { buys, sells }));
  else if (sells > buys) facts.push(t('stock:congressMoreSells', { buys, sells }));
  else if (buys > 0) facts.push(t('stock:congressEven', { count: buys }));
  // Newest by date, not row order: Postgres sorts null dates first on desc.
  const latest = trades
    .filter((tr) => tr.transactionDate && (isBuy(tr.tradeType) || isSell(tr.tradeType)))
    .sort((a, b) => b.transactionDate!.localeCompare(a.transactionDate!))[0];
  if (latest) {
    facts.push(t(isBuy(latest.tradeType) ? 'stock:congressLatestBuy' : 'stock:congressLatestSell', {
      member: latest.politician.name,
      date: f.longDate(latest.transactionDate!),
    }));
  }
  const perMember = new Map<string, { slug: string; name: string; n: number }>();
  for (const tr of trades) {
    const m = perMember.get(tr.politician.slug) ?? { slug: tr.politician.slug, name: tr.politician.name, n: 0 };
    perMember.set(tr.politician.slug, { ...m, n: m.n + 1 });
  }
  const [top, second] = [...perMember.values()].sort((a, b) => b.n - a.n);
  if (top && top.n >= 2 && (!second || second.n < top.n)) facts.push(t('stock:congressTopMember', { member: top.name, count: top.n }));
  const recent = trades.filter((tr) => tr.transactionDate && tr.transactionDate >= yearAgo).length;
  facts.push(recent === 0 ? t('stock:congressRecentNone') : t('stock:congressRecent', { count: recent }));

  // The member who traded it most (Pelosi on NVDA, 17 trades) is the one
  // people look for, not whoever happened to trade last.
  const next = top
    ? { href: `/discover/politicians/${top.slug}`, label: t('stock:congressNext', { member: top.name }) }
    : null;
  const daysToReport = (traded: string | null, reported: string | null) =>
    traded && reported ? Math.round((Date.parse(reported) - Date.parse(traded)) / 86400_000) : null;

  return (
    <StockSubpageShell
      ticker={ticker}
      name={name}
      title={t('stock:congressH1', { name })}
      promise={t('stock:subpagePromiseCongress', { name })}
      active="congress"
      available={available}
      next={next}
      signedIn={!!userId}
      t={t}
    >
      {failed ? (
        <SubpageLoadError name={name} href={`/stock/${ticker}/congress-trades`} t={t} />
      ) : trades.length === 0 ? (
        <p className="text-base text-foreground">{t('stock:congressNone', { name })}</p>
      ) : (
        <>
          <p className="max-w-[65ch] text-pretty text-base leading-relaxed text-foreground">
            {t('stock:congressSummaryCounts', {
              trades: t('stock:congressTradeCount', { count: trades.length }),
              members: t('stock:congressMemberCount', { count: members.size }),
              since: earliest ? f.longDate(earliest) : '',
            })}
          </p>
          <ul className="mt-4 max-w-[65ch] space-y-1.5 text-pretty text-sm leading-relaxed text-muted-foreground">
            {facts.map((fact) => <li key={fact}>{fact}</li>)}
          </ul>

          <h2 id="congress-trades" className="mt-10 text-lg font-semibold text-foreground">{t('stock:congressTradesHeading')}</h2>
          <p className="mt-1 max-w-[65ch] text-pretty text-xs leading-relaxed text-muted-foreground">{t('stock:congressIntro', { name })}</p>

          {/* Below sm the dates fold under the member's name: a five-column
              table at 375px clipped the amounts mid-number. */}
          <div className="mt-3 overflow-x-auto">
            <ExpandableTable
              labelledBy="congress-trades"
              className="w-full text-left text-sm"
              showAllLabel={t('stock:subpageShowAll', { count: trades.length })}
              head={
                <thead>
                  <tr className="border-b text-xs text-muted-foreground">
                    <th scope="col" className="py-2 pr-3 font-medium">{t('stock:congressColMember')}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t('stock:congressColType')}</th>
                    <th scope="col" className="py-2 pr-3 font-medium">{t('stock:congressColAmount')}</th>
                    <th scope="col" className="hidden py-2 pr-3 font-medium sm:table-cell">{t('stock:congressColTraded')}</th>
                    <th scope="col" className="hidden py-2 font-medium sm:table-cell">{t('stock:congressColReported')}</th>
                  </tr>
                </thead>
              }
              rows={trades.map((tr, i) => {
                const lag = daysToReport(tr.transactionDate, tr.disclosureDate);
                return (
                  <tr key={`${tr.politician.slug}-${tr.transactionDate}-${i}`} className="border-b border-border/50 align-top">
                    <th scope="row" className="py-2.5 pr-3 font-normal">
                      <Link href={`/discover/politicians/${tr.politician.slug}`} className="font-medium text-foreground hover:underline">
                        {tr.politician.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">{position(tr.politician)}</span>
                      {/* The reporting delay is the point of the Reported column; phones keep it. */}
                      {tr.transactionDate && (
                        <span className="block text-xs text-muted-foreground sm:hidden">
                          {lag != null && lag > 0
                            ? t('stock:congressTradedReported', { date: f.date(tr.transactionDate), count: lag })
                            : t('stock:congressTradedOn', { date: f.date(tr.transactionDate) })}
                        </span>
                      )}
                    </th>
                    {/* Words plus a neutral arrow, not colour: a trade is not a gain or a loss. */}
                    <td className="py-2.5 pr-3 text-foreground">
                      <span className="inline-flex items-center gap-1 whitespace-nowrap">
                        {isBuy(tr.tradeType) && <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
                        {isSell(tr.tradeType) && <ArrowDownRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />}
                        {typeLabel(tr.tradeType)}
                      </span>
                    </td>
                    <td className="py-2.5 pr-3 font-mono text-sm tabular-nums text-foreground">{tr.amountRange ?? <NotReported t={t} />}</td>
                    <td className="hidden whitespace-nowrap py-2.5 pr-3 text-muted-foreground sm:table-cell">{tr.transactionDate ? f.date(tr.transactionDate) : <NotReported t={t} />}</td>
                    <td className="hidden whitespace-nowrap py-2.5 text-muted-foreground sm:table-cell">{tr.disclosureDate ? f.date(tr.disclosureDate) : <NotReported t={t} />}</td>
                  </tr>
                );
              })}
            />
          </div>
        </>
      )}

      <p className="mt-6 text-sm">
        <Link href="/discover/politicians" className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4 hover:text-foreground">
          {t('stock:congressAllMembers')}
        </Link>
      </p>
    </StockSubpageShell>
  );
}
