import type { Metadata } from 'next';
import Link from 'next/link';
import { cache } from 'react';
import { Lock } from 'lucide-react';
import { getDisplayNames } from '@/lib/market-data/display-names';
import { getAvailableSubpages, getFundHolders, getSubpageCoverage, MIN_FUND_HOLDERS } from '@/lib/stock/subpage-data';
import { SIGNIFICANT_TICKERS } from '@/lib/market-data/significant-tickers';
import { createServerClient } from '@/lib/supabase/client';
import { getCurrentUserId } from '@/lib/auth/server-session';
import { getTier, isPro } from '@/lib/billing/tier';
import { PRICING } from '@/lib/billing/entitlements';
import { shortFundName } from '@/lib/institutions/format';
import { getRequestLocale, getServerT } from '@/lib/i18n/server';
import { NotReported, StockSubpageShell, SubpageLoadError, subpageFormat } from '@/components/stock/StockSubpageShell';

/**
 * /stock/[ticker]/fund-holders: which of the famous funds BullPen tracks held
 * this stock in their latest 13F. Who holds it is public (the fund list is on
 * Discover already), and so is the size of the biggest position: that is the
 * answer "how much Apple does Buffett own" searches come for. Every other
 * position's size and share of the fund is the Pro feature, so it is only
 * rendered for a Pro reader, never sent to anyone else and hidden with CSS.
 */
const load = cache(async (ticker: string) => {
  const db = createServerClient();
  const [names, holders, fundCount, peerCounts, available] = await Promise.all([
    getDisplayNames([ticker]).catch(() => new Map<string, string>()),
    getFundHolders(ticker).catch(() => null),
    db.from('institutional_investors').select('id', { count: 'exact', head: true }).eq('is_active', true)
      .then((r) => (r.error ? null : r.count ?? 0)),
    // How many tracked funds hold each S&P 500 / Nasdaq-100 stock, for the one
    // fact on this page that is about this stock and not the template.
    getSubpageCoverage([...SIGNIFICANT_TICKERS]).then((c) => c.funds).catch(() => null),
    getAvailableSubpages(ticker),
  ]);
  return {
    name: names.get(ticker) ?? ticker,
    holders: holders ?? [],
    fundCount: fundCount ?? 0,
    // "None of the 0 funds we track" is the failure the empty state can't tell apart.
    failed: !holders || (holders.length === 0 && fundCount == null),
    peerCounts,
    available,
  };
});

export async function generateMetadata({ params }: { params: Promise<{ ticker: string }> }): Promise<Metadata> {
  const ticker = (await params).ticker.toUpperCase();
  const [{ name, holders, failed, peerCounts }, t] = await Promise.all([load(ticker), getRequestLocale().then((l) => getServerT(l, `/stock/${ticker}`))]);
  // Empty, or too thin for the sitemap (peerCounts is the sitemap's own count;
  // tickers outside it are disallowed in robots.txt): still linked, not indexed.
  const thin = (holders.length === 0 && !failed) || (peerCounts != null && (peerCounts.get(ticker) ?? 0) < MIN_FUND_HOLDERS);
  return {
    title: t('stock:fundsMetaTitle', { name, ticker }),
    description: t('stock:fundsMetaDescription', { name, ticker }),
    alternates: { canonical: `/stock/${ticker}/fund-holders` },
    ...(thin ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function StockFundHoldersPage({ params }: { params: Promise<{ ticker: string }> }) {
  const ticker = (await params).ticker.toUpperCase();
  const locale = await getRequestLocale();
  const userId = await getCurrentUserId().catch(() => null);
  const [{ name, holders, fundCount, failed, peerCounts, available }, t, pro] = await Promise.all([
    load(ticker),
    getServerT(locale, `/stock/${ticker}`),
    userId ? getTier(userId).then(isPro).catch(() => false) : Promise.resolve(false),
  ]);
  const f = subpageFormat(locale);
  const latestQuarter = holders.reduce<string | null>((max, h) => (!max || h.periodOfReport > max ? h.periodOfReport : max), null);
  // Where this stock ranks among the covered stocks by how many of these funds
  // hold it. Said only when notable (top quarter). Stocks no fund holds are
  // absent from the map but still count as peers.
  let popularity: string | null = null;
  if (peerCounts && holders.length > 0 && SIGNIFICANT_TICKERS.has(ticker)) {
    const more = [...peerCounts.values()].filter((n) => n > holders.length).length;
    const share = more / SIGNIFICANT_TICKERS.size;
    if (more === 0) popularity = t('stock:fundsPopularityTop');
    else if (share <= 0.25) popularity = t('stock:fundsPopularity', { name, pct: f.pct(Math.max(share, 0.01), 0) });
  }

  const top = holders[0];
  const next = top ? { href: `/discover/institutions/${top.fund.slug}`, label: t('stock:fundsNext', { fund: shortFundName(top.fund.name) }) } : null;
  // Guests sign up first (a trial starts there); a free account goes to the plans.
  const proHref = userId ? '/upgrade?from=fund-holders' : `/register?redirect=${encodeURIComponent(`/stock/${ticker}/fund-holders`)}`;

  return (
    <StockSubpageShell
      ticker={ticker}
      name={name}
      title={t('stock:fundsH1', { name })}
      promise={t('stock:subpagePromiseFunds', { name })}
      active="funds"
      available={available}
      next={next}
      signedIn={!!userId}
      t={t}
    >
      {failed ? (
        <SubpageLoadError name={name} href={`/stock/${ticker}/fund-holders`} t={t} />
      ) : holders.length === 0 ? (
        <p className="text-base text-foreground">{t('stock:fundsNone', { name, count: fundCount })}</p>
      ) : (
        <>
          <p className="max-w-[65ch] text-pretty text-base leading-relaxed text-foreground">
            {t('stock:fundsSummary', { held: holders.length, count: fundCount, name, quarter: latestQuarter ? f.longDate(latestQuarter) : '' })}
          </p>
          {popularity && <p className="mt-2 max-w-[65ch] text-pretty text-sm leading-relaxed text-muted-foreground">{popularity}</p>}

          <h2 id="fund-list" className="mt-10 text-lg font-semibold text-foreground">{t('stock:fundsListHeading')}</h2>
          <p className="mt-1 max-w-[65ch] text-pretty text-xs leading-relaxed text-muted-foreground">{t('stock:fundsIntro')}</p>

          <ul aria-labelledby="fund-list" className="mt-3 divide-y divide-border/50 rounded-xl border">
            {holders.map((h, i) => (
              // The whole row is the link's tap target (the name alone was 21px
              // tall), so the focus ring goes round the row too.
              <li key={h.fund.slug} className="relative flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3 transition-colors hover:bg-card/60 has-[a:focus-visible]:outline-2 has-[a:focus-visible]:-outline-offset-2 has-[a:focus-visible]:outline-ring">
                <div className="min-w-0">
                  <Link href={`/discover/institutions/${h.fund.slug}`} className="font-medium text-foreground outline-none after:absolute after:inset-0">
                    {shortFundName(h.fund.name)}
                  </Link>
                  {/* The quarter is in the summary; a fund still on an older filing says so. */}
                  {(h.fund.manager || h.periodOfReport !== latestQuarter) && (
                    <p className="text-xs text-muted-foreground">
                      {[h.fund.manager, h.periodOfReport !== latestQuarter ? t('stock:fundsAsOf', { date: f.date(h.periodOfReport) }) : null].filter(Boolean).join(' · ')}
                    </p>
                  )}
                </div>
                {/* A locked row says so; a blank right side read as missing data. */}
                {!pro && i > 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <Lock className="h-3 w-3" aria-hidden />
                    {t('stock:fundsLockedValue')}
                  </span>
                ) : (
                  <div className="text-right">
                    <p className="font-mono text-sm tabular-nums text-foreground">{h.valueUsd ? f.usdCompact(h.valueUsd) : <NotReported t={t} />}</p>
                    {h.portfolioPct != null && (
                      <p className="text-xs text-muted-foreground">{t('stock:fundsOfPortfolio', { pct: f.pct(h.portfolioPct / 100, 1) })}</p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>

          {!pro && holders.length > 1 && (
            <Link
              href={proHref}
              className="mt-4 flex items-start gap-3 rounded-xl border bg-card/50 p-4 transition-colors hover:bg-card"
            >
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
              <span>
                <span className="block text-sm font-medium text-foreground">{t('stock:fundsProTitle', { name })}</span>{' '}
                <span className="block text-xs text-muted-foreground">
                  {t('stock:fundsProBody')}
                  {/* Guests only: a signed-in free account may have used its trial already. */}
                  {!userId && <> {t('stock:fundsProTrial', { days: PRICING.trialDays })}</>}
                </span>
              </span>
            </Link>
          )}
        </>
      )}

      <p className="mt-6 text-sm">
        <Link href="/discover/institutions" className="inline-flex min-h-11 items-center text-muted-foreground underline underline-offset-4 hover:text-foreground">
          {t('stock:fundsAllFunds')}
        </Link>
      </p>
    </StockSubpageShell>
  );
}
