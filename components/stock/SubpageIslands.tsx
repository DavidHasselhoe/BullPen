'use client';

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { useLivePrices } from '@/hooks/use-live-prices';
import { useThrottle } from '@/hooks/use-throttle';
import { AddToListPicker } from '@/components/watchlist/AddToListPicker';
import { cn } from '@/lib/utils';

/**
 * The client pieces of the server-rendered stock subpages
 * (StockSubpageShell): everything else on those pages is plain HTML.
 */

/**
 * The subpage tab strip. Scrolls only as far as the current tab needs: at
 * 375px the labels overflow, and centring the current tab pushed Overview off
 * the left edge. A fade on either edge says there is more to swipe to.
 */
export function SubpageTabs({ label, tabs }: { label: string; tabs: Array<{ href: string; label: string; current: boolean }> }) {
  const nav = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = nav.current;
    if (!el) return;
    const current = el.querySelector<HTMLElement>('[aria-current="page"]');
    const overshoot = current ? current.offsetLeft + current.offsetWidth - el.clientWidth : 0;
    if (overshoot > 0) el.scrollLeft = overshoot + 16;
    // Data attributes, not state: they only drive the CSS mask.
    const mark = () => {
      el.dataset.more = String(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
      el.dataset.less = String(el.scrollLeft > 2);
    };
    mark();
    el.addEventListener('scroll', mark, { passive: true });
    return () => el.removeEventListener('scroll', mark);
  }, []);

  return (
    <nav
      ref={nav}
      aria-label={label}
      className={cn(
        'scrollbar-hide mt-4 flex gap-1 overflow-x-auto border-b',
        'data-[more=true]:[mask-image:linear-gradient(to_right,black_calc(100%-40px),transparent)]',
        'data-[less=true]:[mask-image:linear-gradient(to_left,black_calc(100%-40px),transparent)]',
        '[&[data-less=true][data-more=true]]:[mask-image:linear-gradient(to_right,transparent,black_40px,black_calc(100%-40px),transparent)]'
      )}
    >
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={tab.current ? 'page' : undefined}
          className={cn(
            '-mb-px inline-flex min-h-11 shrink-0 items-center whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors',
            tab.current ? 'border-foreground text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Price, day change and Watch under a subpage's heading, so a reader who
 * arrived from a search sees the stock and the product, not only a table.
 * Seeded on the server from the shared last-price cache (no TwelveData call
 * per crawl), then live through the same stream the stock page uses. Watch
 * is the stock page's button: a guest gets the sign-up dialog and the stock
 * is watched once they are in.
 */
export function SubpagePriceStrip({ ticker, name, seed, promise }: {
  ticker: string;
  name: string;
  seed: { price: number; changePercent: number | null } | null;
  promise: string;
}) {
  const { i18n } = useTranslation();
  const live = useThrottle(useLivePrices([ticker]).get(ticker), 1000);
  const price = live?.price ?? seed?.price ?? null;
  const pct = live?.changePercent ?? seed?.changePercent ?? null;
  const locale = i18n.resolvedLanguage ?? 'en';

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        {price != null && (
          <p className="flex items-baseline gap-2 font-mono tabular-nums">
            <span className="text-xl font-semibold text-foreground">
              {new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' }).format(price)}
            </span>
            {pct != null && (
              // Arrow and sign as well as colour (PRODUCT.md: never colour alone).
              <span className={cn('inline-flex items-center gap-0.5 text-sm', pct >= 0 ? 'text-gain' : 'text-loss')}>
                {pct >= 0 ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden />}
                {new Intl.NumberFormat(locale, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: 'always' }).format(pct / 100)}
              </span>
            )}
          </p>
        )}
        <AddToListPicker symbol={ticker} companyName={name} />
      </div>
      <p className="mt-2 max-w-[65ch] text-pretty text-sm text-muted-foreground">{promise}</p>
    </div>
  );
}

/**
 * A table that shows its first 10 rows and a "Show all" button. Every row is
 * in the server HTML (crawlers and no-JS readers get them all); the rest are
 * hidden with CSS until asked for. 42 congress trades ran ~4,600px on a phone.
 */
export function ExpandableTable({ head, rows, showAllLabel, className, labelledBy }: {
  head: ReactNode;
  rows: ReactNode[];
  showAllLabel: string;
  className?: string;
  labelledBy: string;
}) {
  const [open, setOpen] = useState(false);
  const collapsible = rows.length > 10;
  return (
    <>
      <table aria-labelledby={labelledBy} className={className}>
        {head}
        <tbody className={cn(collapsible && !open && '[&>tr:nth-child(n+11)]:hidden')}>{rows}</tbody>
      </table>
      {collapsible && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-foreground underline underline-offset-4 hover:text-foreground/80"
        >
          {showAllLabel}
        </button>
      )}
    </>
  );
}
