/**
 * Stock page shell.
 *
 * The page itself is a client component (StockPageClient) — it has to be, since
 * nearly everything on it is interactive. What this server component adds is the
 * snapshot: price, statistics and earnings, fetched here and handed to the client
 * already resolved.
 *
 * Before this, the browser downloaded the page, hydrated (~950ms in production),
 * and only then asked for the snapshot, which took another 1.3-1.8s. Prices
 * appeared somewhere north of two seconds after the page did. Now they are in
 * the first render, and the client's useStockSnapshot finds them already in the
 * query cache instead of fetching.
 *
 * loading.tsx keeps this from costing anything visible: the shell streams
 * immediately while this waits on the snapshot.
 */

import { HydrationBoundary, QueryClient, dehydrate } from '@tanstack/react-query';
import { buildSnapshot, type StockSnapshot } from '@/lib/stock/snapshot';
import { slugToSymbol } from '@/lib/assets/asset-type';
import { getSectorPeers } from '@/lib/market-data/stock-directory';
import { SectorPeers } from '@/components/stock/SectorPeers';
import { StockGlance } from '@/components/stock/StockGlance';
import { getDisplayNames } from '@/lib/market-data/display-names';
import { getRequestLocale, getServerT } from '@/lib/i18n/server';
import { getSubpageCoverage } from '@/lib/stock/subpage-data';
import Link from 'next/link';
import StockPageClient from './StockPageClient';

export default async function StockPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker: rawTicker } = await params;
  // Must match the key useStockSnapshot builds on the client, which upper-cases
  // the route param before using it — a mismatch would silently prefetch into a
  // key nothing reads.
  const ticker = rawTicker.toUpperCase();

  const queryClient = new QueryClient();
  // Started now, awaited after the snapshot: neither waits on the other, and
  // a failure only costs the row, never the page.
  const peersPromise = getSectorPeers(ticker).catch(() => null);
  const namePromise = getDisplayNames([ticker]).then((m) => m.get(ticker)).catch(() => undefined);
  const localePromise = getRequestLocale();
  // Which subpages have something to show for this ticker; only those are linked.
  const coveragePromise = getSubpageCoverage([ticker]).catch(() => null);
  try {
    await queryClient.prefetchQuery({
      queryKey: ['stock-snapshot', ticker],
      queryFn: () => buildSnapshot(slugToSymbol(ticker)),
    });
  } catch {
    // A failed prefetch is not a failed page: the client hook will ask for it
    // itself, exactly as it did before this existed.
  }

  const [peers, name, locale, coverage] = await Promise.all([peersPromise, namePromise, localePromise, coveragePromise]);
  const snapshot = queryClient.getQueryData<StockSnapshot>(['stock-snapshot', ticker]);
  const t = snapshot || coverage ? await getServerT(locale, `/stock/${ticker}`) : null;

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {/* The name comes from the server so the heading is in the first HTML
          too: the header used to wait for a browser-side company fetch. */}
      <StockPageClient initialName={name} />
      {(peers || t) && (
        // Lines up with the main column: lg:px-8 plus the 160px nav and 32px gap at xl.
        <div className="mx-auto max-w-[1520px] px-4 pb-12 sm:px-6 lg:px-8 xl:pl-[224px]">
          {snapshot && t && <StockGlance ticker={ticker} name={name ?? ticker} snapshot={snapshot} locale={locale} t={t} />}
          {t && coverage && (coverage.dividends.has(ticker) || coverage.congress.has(ticker) || coverage.funds.has(ticker)) && (
            <section aria-labelledby="stock-more-heading" className="mt-12 border-t border-border/50 pt-8">
              <h2 id="stock-more-heading" className="text-lg font-semibold tracking-tight text-foreground">{t('stock:subpagesHeading', { name: name ?? ticker })}</h2>
              <ul className="mt-4 grid gap-2 sm:grid-cols-3">
                {[
                  { show: coverage.dividends.has(ticker), href: `/stock/${ticker}/dividends`, label: t('stock:subnavDividends'), desc: t('stock:subpagesDividendsDesc') },
                  { show: coverage.congress.has(ticker), href: `/stock/${ticker}/congress-trades`, label: t('stock:subnavCongress'), desc: t('stock:subpagesCongressDesc') },
                  { show: coverage.funds.has(ticker), href: `/stock/${ticker}/fund-holders`, label: t('stock:subnavFunds'), desc: t('stock:subpagesFundsDesc') },
                ].filter((l) => l.show).map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="block rounded-xl border bg-card/50 px-4 py-3 transition-colors hover:border-foreground/20 hover:bg-card">
                      <span className="block text-sm font-medium text-foreground">{l.label}</span>
                      <span className="block text-xs text-muted-foreground">{l.desc}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {peers && <SectorPeers sector={peers.sector} peers={peers.peers} />}
        </div>
      )}
    </HydrationBoundary>
  );
}
