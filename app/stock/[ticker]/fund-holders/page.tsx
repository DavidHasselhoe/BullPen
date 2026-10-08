import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { Lock } from 'lucide-react';
import { getDisplayNames } from '@/lib/market-data/display-names';
import { getFundHolders } from '@/lib/stock/subpage-data';
import { createServerClient } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/auth/server-session';
import { getTier, isPro } from '@/lib/billing/tier';
import { getRequestLocale, getServerT } from '@/lib/i18n/server';
import { StockSubpageShell, subpageFormat } from '@/components/stock/StockSubpageShell';

/**
 * /stock/[ticker]/fund-holders: which of the famous funds BullPen tracks held
 * this stock in their latest 13F. Who holds it is public (the fund list is on
 * Discover already); how big each position is, and its share of the fund, is
 * the Pro feature, so it is only rendered for a Pro reader, never sent to
 * anyone else and hidden with CSS.
 */
const load = cache(async (ticker: string) => {
  const db = createServerClient();
  const [names, holders, fundCount] = await Promise.all([
    getDisplayNames([ticker]).catch(() => new Map<string, string>()),
    getFundHolders(ticker).catch(() => []),
    db.from('institutional_investors').select('id', { count: 'exact', head: true }).eq('is_active', true).then((r) => r.count ?? 0),
  ]);
  return { name: names.get(ticker) ?? ticker, holders, fundCount };
});

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const ticker = (await params).ticker.toUpperCase();
  const [{ name, holders }, t] = await Promise.all([load(ticker), getRequestLocale().then((l) => getServerT(l, `/stock/${ticker}`))]);
  return {
    title: t('stock:fundsMetaTitle', { name, ticker }),
    description: t('stock:fundsMetaDescription', { name, ticker }),
    alternates: { canonical: `/stock/${ticker}/fund-holders` },
    ...(holders.length === 0 ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function StockFundHoldersPage({ params }: { params: Promise<{ ticker: string }> }) {
  const ticker = (await params).ticker.toUpperCase();
  const locale = await getRequestLocale();
  const userId = await getCurrentUserId().catch(() => null);
  const [{ name, holders, fundCount }, t, pro] = await Promise.all([
    load(ticker),
    getServerT(locale, `/stock/${ticker}`),
    userId ? getTier(userId).then(isPro).catch(() => false) : Promise.resolve(false),
  ]);
  const f = subpageFormat(locale);
  const latestQuarter = holders.reduce<string | null>((max, h) => (!max || h.periodOfReport > max ? h.periodOfReport : max), null);

  return (
    <StockSubpageShell ticker={ticker} name={name} active="funds" t={t}>
      <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{t('stock:fundsH1', { name })}</h1>
      <p className="mt-3 max-w-3xl text-pretty text-sm leading-relaxed text-muted-foreground">{t('stock:fundsIntro')}</p>

      {holders.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t('stock:fundsNone', { name, count: fundCount })}</p>
      ) : (
        <>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-foreground">
            {t('stock:fundsSummary', { held: holders.length, count: fundCount, name, quarter: latestQuarter ? f.longDate(latestQuarter) : '' })}
          </p>

          <ul className="mt-6 divide-y divide-border/50 rounded-xl border">
            {holders.map((h) => (
              <li key={h.fund.slug} className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3">
                <div className="min-w-0">
                  <Link href={`/discover/institutions/${h.fund.slug}`} className="font-medium text-foreground hover:underline">
                    {h.fund.name}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {[h.fund.manager, t('stock:fundsAsOf', { date: f.date(h.periodOfReport) })].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {pro && (
                  <div className="text-right">
                    <p className="font-mono text-sm tabular-nums text-foreground">{h.valueUsd ? f.usdCompact(h.valueUsd) : '–'}</p>
                    <p className="text-xs text-muted-foreground">
                      {h.portfolioPct != null ? t('stock:fundsOfPortfolio', { pct: f.pct(h.portfolioPct / 100, 1) }) : ''}
                    </p>
                  </div>
                )}
              </li>
            ))}
          </ul>

          {!pro && (
            <Link
              href={`/upgrade?from=fund-holders`}
              className="mt-4 flex items-start gap-3 rounded-xl border bg-card/50 p-4 transition-colors hover:bg-card"
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                <span className="block text-sm font-medium text-foreground">{t('stock:fundsProTitle', { name })}</span>
                <span className="block text-xs text-muted-foreground">{t('stock:fundsProBody')}</span>
              </span>
            </Link>
          )}
        </>
      )}

      <p className="mt-6 text-sm">
        <Link href="/discover/institutions" className="text-muted-foreground underline underline-offset-4 hover:text-foreground">
          {t('stock:fundsAllFunds')}
        </Link>
      </p>
    </StockSubpageShell>
  );
}
