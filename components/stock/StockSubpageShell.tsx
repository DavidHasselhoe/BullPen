import Link from 'next/link';
import type { TFunction } from 'i18next';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { buttonVariants } from '@/components/ui/button';
import { getLastPrices } from '@/lib/market-data/last-price-cache';
import { cn } from '@/lib/utils';
import { SubpagePriceStrip, SubpageTabs } from './SubpageIslands';

export type StockSubpage = 'dividends' | 'congress' | 'funds';

/** The one next step a subpage offers, tied to what the reader just looked at. */
export interface SubpageNext {
  href: string;
  label: string;
}

/**
 * Frame for the server-rendered stock subpages: back to the stock, tabs
 * between the subpages, the heading with the stock's price and Watch, and a
 * closing next step. The tabs are plain links on purpose: they are how a
 * crawler (and a reader) gets from one ticker's page to the next view of it.
 * Only subpages with something on them get a tab (`available`, from
 * getSubpageCoverage), as on the stock page; unknown coverage shows them all.
 * `promise` is what watching this stock gets the reader, said in this page's
 * terms; it must name a notification that really exists.
 */
export async function StockSubpageShell({
  ticker, name, title, promise, active, available, next, signedIn, t, children,
}: {
  ticker: string;
  name: string;
  title: string;
  promise: string;
  active: StockSubpage;
  available?: StockSubpage[] | null;
  next?: SubpageNext | null;
  signedIn: boolean;
  t: TFunction;
  children: React.ReactNode;
}) {
  const seed = (await getLastPrices([ticker]).catch(() => null))?.get(ticker) ?? null;
  const tabs: Array<{ key: StockSubpage | 'overview'; href: string; label: string }> = [
    { key: 'overview', href: `/stock/${ticker}`, label: t('stock:subnavOverview') },
    { key: 'dividends', href: `/stock/${ticker}/dividends`, label: t('stock:subnavDividends') },
    { key: 'congress', href: `/stock/${ticker}/congress-trades`, label: t('stock:subnavCongress') },
    { key: 'funds', href: `/stock/${ticker}/fund-holders`, label: t('stock:subnavFunds') },
  ];
  const shown = tabs.filter((tab) => tab.key === 'overview' || tab.key === active || !available || available.includes(tab.key));
  const here = tabs.find((tab) => tab.key === active)!.href;

  return (
    <div className="min-h-screen bg-background">
      {/* pb-32: room for the cookie banner, which sat over the closing card. */}
      <main className="mx-auto max-w-3xl px-4 pb-32 pt-8 sm:px-6 lg:px-8">
        <Link
          href={`/stock/${ticker}`}
          className="inline-flex min-h-11 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {/* The visible text stays inside the accessible name, for voice control. */}
          <span className="sr-only">{t('stock:subpageBackTo')} </span>
          {name} <span className="font-mono">{ticker}</span>
        </Link>

        <SubpageTabs
          label={t('stock:subnavAria', { name })}
          tabs={shown.map((tab) => ({ href: tab.href, label: tab.label, current: tab.key === active }))}
        />

        <h1 className="mt-8 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">{title}</h1>
        <SubpagePriceStrip ticker={ticker} name={name} seed={seed} promise={promise} />

        <div className="pt-8">{children}</div>

        {(next || !signedIn) && (
          <section aria-label={t('stock:subpageNextAria')} className="mt-12 rounded-xl border bg-card/50 p-5">
            {!signedIn && <p className="max-w-[65ch] text-pretty text-sm leading-relaxed text-muted-foreground">{t('stock:subpageAbout')}</p>}
            <div className={cn('flex flex-wrap items-center gap-x-5 gap-y-3', !signedIn && 'mt-4')}>
              {next && (
                // Wraps: nowrap ran "See what 10 shares of Coca-Cola…" 48px past a phone's card.
                <Link href={next.href} className={cn(buttonVariants({ size: 'lg' }), 'h-auto min-h-11 max-w-full whitespace-normal py-2.5 text-left')}>
                  {next.label}
                  <ArrowRight aria-hidden />
                </Link>
              )}
              {!signedIn && (
                <Link
                  href={`/register?redirect=${encodeURIComponent(here)}`}
                  // The secondary action beside a next step; the only one otherwise.
                  className={next
                    ? 'inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-4 hover:text-foreground/80'
                    : cn(buttonVariants({ size: 'lg' }), 'h-auto min-h-11 max-w-full whitespace-normal py-2.5 text-left')}
                >
                  {t('stock:subpageSignup')}
                </Link>
              )}
            </div>
          </section>
        )}

        <p className="mt-8 text-xs text-muted-foreground">{t('stock:glanceNotAdvice')}</p>
      </main>
    </div>
  );
}

/**
 * Shown instead of the data when a loader failed. Without it a TwelveData or
 * Supabase hiccup read as "Apple doesn't pay a dividend" and noindexed the page.
 */
export function SubpageLoadError({ name, href, t }: { name: string; href: string; t: TFunction }) {
  return (
    <div role="status" className="mt-6 rounded-xl border p-5">
      <p className="text-sm text-foreground">{t('stock:subpageLoadError', { name })}</p>
      {/* A plain <a>: a full reload re-runs the server loader. */}
      <a href={href} className="mt-3 inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-4 hover:text-foreground/80">
        {t('stock:subpageRetry')}
      </a>
    </div>
  );
}

/** An empty table cell: a dash to the eye, words to a screen reader. */
export function NotReported({ t }: { t: TFunction }) {
  return (
    <>
      <span aria-hidden>–</span>
      <span className="sr-only">{t('stock:subpageNotReported')}</span>
    </>
  );
}

/** Formatters shared by the subpages, in the reader's locale. */
export function subpageFormat(locale: string) {
  const usd = (v: number, digits = 2) =>
    new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v);
  return {
    usd,
    /**
     * A per-share amount: $0.27, $0.205, $0.004, never "$0.0100". Padding a
     * whole column to one 3-decimal value read worse ("$1.030") than a
     * slightly ragged one.
     */
    perShare: (v: number) =>
      new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 4 }).format(v),
    usdCompact: (v: number) =>
      new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(v),
    pct: (v: number, digits = 2) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: digits }).format(v),
    date: (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }),
    monthYear: (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { year: 'numeric', month: 'long', timeZone: 'UTC' }),
    longDate: (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }),
  };
}
