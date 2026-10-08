import Link from 'next/link';
import type { TFunction } from 'i18next';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export type StockSubpage = 'dividends' | 'congress' | 'funds';

/**
 * Frame for the server-rendered stock subpages: back to the stock, and tabs
 * between the subpages. The tabs are plain links on purpose: they are how a
 * crawler (and a reader) gets from one ticker's page to the next view of it.
 */
export function StockSubpageShell({
  ticker, name, active, t, children,
}: {
  ticker: string;
  name: string;
  active: StockSubpage;
  t: TFunction;
  children: React.ReactNode;
}) {
  const tabs: Array<{ key: StockSubpage | 'overview'; href: string; label: string }> = [
    { key: 'overview', href: `/stock/${ticker}`, label: t('stock:subnavOverview') },
    { key: 'dividends', href: `/stock/${ticker}/dividends`, label: t('stock:subnavDividends') },
    { key: 'congress', href: `/stock/${ticker}/congress-trades`, label: t('stock:subnavCongress') },
    { key: 'funds', href: `/stock/${ticker}/fund-holders`, label: t('stock:subnavFunds') },
  ];

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <Link
          href={`/stock/${ticker}`}
          className="inline-flex min-h-9 items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          {name} <span className="font-mono">{ticker}</span>
        </Link>

        <nav aria-label={t('stock:subnavAria', { name })} className="scrollbar-hide mt-4 flex gap-1 overflow-x-auto border-b">
          {tabs.map((tab) => {
            const current = tab.key === active;
            return (
              <Link
                key={tab.key}
                href={tab.href}
                aria-current={current ? 'page' : undefined}
                className={cn(
                  '-mb-px inline-flex min-h-10 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors',
                  current ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>

        <div className="pt-8">{children}</div>

        <p className="mt-12 text-xs text-muted-foreground">{t('stock:glanceNotAdvice')}</p>
      </main>
    </div>
  );
}

/** Formatters shared by the subpages, in the reader's locale. */
export function subpageFormat(locale: string) {
  return {
    usd: (v: number, digits = 2) =>
      new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', minimumFractionDigits: digits, maximumFractionDigits: digits }).format(v),
    usdCompact: (v: number) =>
      new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(v),
    pct: (v: number, digits = 2) => new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: digits }).format(v),
    date: (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }),
    longDate: (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }),
  };
}
