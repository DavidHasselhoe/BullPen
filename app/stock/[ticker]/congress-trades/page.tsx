import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { getDisplayNames } from '@/lib/market-data/display-names';
import { getCongressTrades } from '@/lib/stock/subpage-data';
import { getRequestLocale, getServerT } from '@/lib/i18n/server';
import { StockSubpageShell, subpageFormat } from '@/components/stock/StockSubpageShell';

/**
 * /stock/[ticker]/congress-trades: every trade in this stock that a member of
 * Congress has reported, newest first. Server-rendered for "who in Congress
 * owns NVDA" searches. Washington Trading data is free in the app, so it is
 * all shown here too.
 */
const load = cache(async (ticker: string) => {
  const [names, trades] = await Promise.all([
    getDisplayNames([ticker]).catch(() => new Map<string, string>()),
    getCongressTrades(ticker).catch(() => []),
  ]);
  return { name: names.get(ticker) ?? ticker, trades };
});

const isBuy = (type: string) => /purchase|buy/i.test(type);
const isSell = (type: string) => /sale|sell/i.test(type);

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const ticker = (await params).ticker.toUpperCase();
  const [{ name, trades }, t] = await Promise.all([load(ticker), getRequestLocale().then((l) => getServerT(l, `/stock/${ticker}`))]);
  return {
    title: t('stock:congressMetaTitle', { name, ticker }),
    description: t('stock:congressMetaDescription', { name, ticker }),
    alternates: { canonical: `/stock/${ticker}/congress-trades` },
    ...(trades.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function StockCongressTradesPage({ params }: { params: Promise<{ ticker: string }> }) {
  const ticker = (await params).ticker.toUpperCase();
  const locale = await getRequestLocale();
  const [{ name, trades }, t] = await Promise.all([load(ticker), getServerT(locale, `/stock/${ticker}`)]);
  const f = subpageFormat(locale);

  const members = new Set(trades.map((tr) => tr.politician.slug));
  const buys = trades.filter((tr) => isBuy(tr.tradeType)).length;
  const sells = trades.filter((tr) => isSell(tr.tradeType)).length;
  const earliest = trades.reduce<string | null>((min, tr) => (tr.transactionDate && (!min || tr.transactionDate < min) ? tr.transactionDate : min), null);

  return (
    <StockSubpageShell ticker={ticker} name={name} active="congress" t={t}>
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{t('stock:congressH1', { name })}</h1>
      <p className="mt-3 max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">{t('stock:congressIntro', { name })}</p>

      {trades.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t('stock:congressNone', { name })}</p>
      ) : (
        <>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-foreground">
            {t('stock:congressSummary', {
              count: trades.length,
              members: members.size,
              buys,
              sells,
              since: earliest ? f.longDate(earliest) : '',
            })}
          </p>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b text-xs text-muted-foreground">
                  <th scope="col" className="py-2 pr-3 font-medium">{t('stock:congressColMember')}</th>
                  <th scope="col" className="py-2 pr-3 font-medium">{t('stock:congressColType')}</th>
                  <th scope="col" className="py-2 pr-3 font-medium">{t('stock:congressColAmount')}</th>
                  <th scope="col" className="py-2 pr-3 font-medium">{t('stock:congressColTraded')}</th>
                  <th scope="col" className="py-2 font-medium">{t('stock:congressColReported')}</th>
                </tr>
              </thead>
              <tbody>
                {trades.map((tr, i) => (
                  <tr key={`${tr.politician.slug}-${tr.transactionDate}-${i}`} className="border-b border-border/50 align-top">
                    <th scope="row" className="py-2.5 pr-3 font-normal">
                      <Link href={`/discover/politicians/${tr.politician.slug}`} className="font-medium text-foreground hover:underline">
                        {tr.politician.name}
                      </Link>
                      <span className="block text-xs text-muted-foreground">
                        {[tr.politician.party, tr.politician.state, tr.politician.chamber].filter(Boolean).join(' · ')}
                      </span>
                    </th>
                    {/* Words, not colour alone: buy and sell read the same to a colour-blind reader otherwise. */}
                    <td className="py-2.5 pr-3 text-foreground">{isBuy(tr.tradeType) ? t('stock:congressBuy') : isSell(tr.tradeType) ? t('stock:congressSell') : tr.tradeType}</td>
                    <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-muted-foreground">{tr.amountRange ?? '–'}</td>
                    <td className="py-2.5 pr-3 text-muted-foreground">{tr.transactionDate ? f.date(tr.transactionDate) : '–'}</td>
                    <td className="py-2.5 text-muted-foreground">{tr.disclosureDate ? f.date(tr.disclosureDate) : '–'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="mt-6 text-sm">
        <Link href="/discover/politicians" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
          {t('stock:congressAllMembers')}
        </Link>
      </p>
    </StockSubpageShell>
  );
}
