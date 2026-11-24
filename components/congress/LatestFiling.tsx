'use client';

/**
 * The top of a politician page: the latest filing, told in words, then one
 * row per stock in it (your stocks first, then the biggest). Everything here
 * is counted from the filed rows; no model writes these sentences, so they
 * cannot claim more than the rows say. See docs/research/washington-trading-clarity.md.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowDownRight, ArrowUpRight, ChevronDown, Info } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { useHoldings } from '@/hooks/use-holdings';
import { useWatchlist } from '@/hooks/use-watchlist';
import { amountBounds, compactAmount, formatAmountRange, tradeDirection, type CongressTradeRow } from '@/lib/congress/types';
import { biggestRuns, buildFiling, earlierFilingDays, sizeLevel, type FilingStock, type SizeLevel } from '@/lib/congress/filing';
import { displayCompanyName } from '@/lib/market-data/company-name';
import { cn } from '@/lib/utils';
import { intlLocale } from '@/lib/i18n/intl-locale';

type Trade = CongressTradeRow & { symbol: string };

/** Under this many trades the rows say the rest; "most were small" over 3 trades is noise. */
const SUMMARY_MIN_TRADES = 6;
/** Stocks shown outside "your stocks" before Show more. */
const REST_FIRST = 5;
const REST_PAGE = 25;
/** A filing this recent wears the New label. */
const NEW_DAYS = 7;

const SIZE_KEYS = ['sizeSmall', 'sizeMedium', 'sizeLarge', 'sizeVeryLarge'] as const;

export function isRecentFiling(day: string, now = Date.now()): boolean {
  return now - Date.parse(`${day}T00:00:00Z`) < NEW_DAYS * 24 * 60 * 60 * 1000;
}

function formatDay(iso: string, locale: string, withYear = false): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    ...(withYear ? { year: 'numeric' } : {}),
    timeZone: 'UTC',
  });
}

function name(t: { symbol: string; companyName?: string | null }): string {
  return t.companyName ? displayCompanyName(t.companyName, t.symbol) : t.symbol;
}

/** "$1M to $5M": the sentence form of a bracket. Rows keep the compact "$1M - $5M". */
function useRangeWords() {
  const { t } = useTranslation('discover');
  return (tr: Pick<CongressTradeRow, 'amountLow' | 'amountHigh' | 'amountRange'>) => {
    const { low, high } = amountBounds(tr.amountLow, tr.amountHigh, tr.amountRange);
    if (low == null) return tr.amountRange;
    return high == null
      ? t('filingRangeOrMore', { low: compactAmount(low) })
      : t('filingRangeWords', { low: compactAmount(low), high: compactAmount(high) });
  };
}

function SizeMeter({ level }: { level: SizeLevel | null }) {
  const { t } = useTranslation('discover');
  if (level == null) return null;
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="flex gap-0.5" aria-hidden>
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={cn('h-2.5 w-1 rounded-sm', i <= level ? 'bg-foreground/70' : 'bg-muted')} />
        ))}
      </span>
      {t(SIZE_KEYS[level])}
    </span>
  );
}

function Direction({ dir, count }: { dir: 'buy' | 'sell'; count: number }) {
  const { t } = useTranslation('discover');
  const Icon = dir === 'buy' ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-medium',
        dir === 'buy' ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
      )}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {t(dir === 'buy' ? 'filingBoughtTimes' : 'filingSoldTimes', { count })}
    </span>
  );
}

function StockRow({ stock }: { stock: FilingStock }) {
  const { t, i18n } = useTranslation('discover');
  const company = name(stock);
  const dates =
    stock.firstDate && stock.lastDate
      ? stock.firstDate === stock.lastDate
        ? formatDay(stock.firstDate, intlLocale(i18n.language))
        : t('filingDates', { from: formatDay(stock.firstDate, intlLocale(i18n.language)), to: formatDay(stock.lastDate, intlLocale(i18n.language)) })
      : null;

  return (
    <li className="border-b border-border/50 last:border-b-0">
      <details className="group/row">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-md py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <CompanyLogo size={28} ticker={stock.symbol} name={company} className="shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
              <span className="min-w-0 break-words text-sm font-medium text-foreground">
                {company}
              </span>
              {company !== stock.symbol && (
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{stock.symbol}</span>
              )}
              {stock.relation && (
                <span className="shrink-0 rounded-full border border-border px-1.5 py-px text-[11px] text-foreground/80">
                  {t(stock.relation === 'owned' ? 'filingOwned' : 'filingWatched')}
                </span>
              )}
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              {stock.buys > 0 && <Direction dir="buy" count={stock.buys} />}
              {stock.sells > 0 && <Direction dir="sell" count={stock.sells} />}
              {dates && <span className="tabular-nums">{dates}</span>}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <SizeMeter level={sizeLevel(stock.biggest)} />
            <p className="mt-0.5 font-mono text-sm tabular-nums text-foreground">
              {formatAmountRange(stock.biggest.amountLow, stock.biggest.amountHigh, stock.biggest.amountRange)}
            </p>
          </div>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/row:rotate-180 motion-reduce:transition-none"
            aria-hidden
          />
        </summary>
        <div className="pb-3 pl-10">
          <ul className="space-y-1 text-xs tabular-nums text-muted-foreground">
            {stock.trades.map((tr) => {
              const dir = tradeDirection(tr.tradeType);
              return (
                <li key={tr.id} className="flex items-center justify-between gap-3">
                  <span>
                    {tr.transactionDate ? formatDay(tr.transactionDate, intlLocale(i18n.language), true) : t('memberUndated')}
                    {' · '}
                    {dir === 'buy' ? t('memberBought') : dir === 'sell' ? t('memberSold') : tr.tradeType}
                  </span>
                  <span className="font-mono text-foreground">
                    {formatAmountRange(tr.amountLow, tr.amountHigh, tr.amountRange)}
                  </span>
                </li>
              );
            })}
          </ul>
          <Link
            href={`/stock/${stock.symbol}`}
            className="mt-2 inline-block rounded-sm text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('filingOpenStock', { company })}
          </Link>
        </div>
      </details>
    </li>
  );
}

function Learn() {
  const { t } = useTranslation('discover');
  const items = [
    ['filingLearnLagQ', 'filingLearnLagA'],
    ['filingLearnRangeQ', 'filingLearnRangeA'],
    ['filingLearnCopyQ', 'filingLearnCopyA'],
  ] as const;
  return (
    <details className="group/learn mt-1">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-sm py-2 text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {t('filingLearnTitle')}
        <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200 group-open/learn:rotate-180 motion-reduce:transition-none" aria-hidden />
      </summary>
      <dl className="mt-2 max-w-prose space-y-2 text-xs leading-relaxed">
        {items.map(([q, a]) => (
          <div key={q}>
            <dt className="font-medium text-foreground">{t(q)}</dt>
            <dd className="text-muted-foreground">{t(a)}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

export function LatestFiling({ trades, day, displayName }: { trades: Trade[]; day: string; displayName: string }) {
  const { t, i18n } = useTranslation('discover');
  const rangeWords = useRangeWords();
  const { data: holdings } = useHoldings();
  const { data: watchlist } = useWatchlist();
  // useHoldings() is open positions only: a stock sold to zero is not "yours".
  const owned = useMemo(() => new Set((holdings ?? []).map((h) => h.symbol.toUpperCase())), [holdings]);
  const watched = useMemo(() => new Set((watchlist ?? []).map((w) => w.symbol.toUpperCase())), [watchlist]);
  const filing = useMemo(() => buildFiling(trades, day, owned, watched), [trades, day, owned, watched]);
  const earlier = useMemo(() => earlierFilingDays(trades, day), [trades, day]);

  if (!filing) return null;

  const yours = filing.stocks.filter((s) => s.relation);
  const rest = filing.stocks.filter((s) => !s.relation);
  const isNew = isRecentFiling(filing.day);
  const today = new Date().toISOString().slice(0, 10);
  const list = new Intl.ListFormat(intlLocale(i18n.language), { type: 'conjunction' });

  // Who, how many and when, always: it is the line that separates "made in
  // September" from "arrived today". The rest only once there is a pile to sum up.
  const vars = { name: displayName, count: filing.count };
  const sentences: string[] = [
    filing.firstDate && filing.lastDate
      ? filing.firstDate === filing.lastDate
        ? t('filingSummaryDay', { ...vars, date: formatDay(filing.firstDate, intlLocale(i18n.language)) })
        : t('filingSummaryRange', {
            ...vars,
            from: formatDay(filing.firstDate, intlLocale(i18n.language)),
            to: formatDay(filing.lastDate, intlLocale(i18n.language)),
          })
      : t('filingSummaryUndated', vars),
  ];
  if (filing.count >= SUMMARY_MIN_TRADES) {
    if (filing.small * 2 > filing.count) {
      sentences.push(t('filingMostSmall', { small: filing.small, count: filing.count }));
    }
    if (filing.biggest.length > 0) {
      const runs = biggestRuns(filing.biggest).map((run) =>
        t(run.direction === 'buy' ? 'filingRunBought' : run.direction === 'sell' ? 'filingRunSold' : 'filingRunOther', {
          names: list.format(run.trades.map(name)),
          range: rangeWords(run.trades[0]),
          count: run.trades.length,
        }),
      );
      sentences.push(t('filingBiggest', { items: runs.join('; ') }));
    }
  }

  return (
    <section id="latest-filing" aria-labelledby="latest-filing-heading" className="mb-10 scroll-mt-20">
      <div className="mb-1 flex items-center gap-2">
        {isNew && (
          <span className="rounded-full bg-foreground px-2 py-0.5 text-[11px] font-medium text-background">
            {t('filingNew')}
          </span>
        )}
        <h2 id="latest-filing-heading" className="text-base font-semibold text-foreground">
          {t('filingLatest')}
        </h2>
        <span className="text-sm text-muted-foreground">
          {filing.day === today ? t('filingArrivedToday') : t('filingArrived', { date: formatDay(filing.day, intlLocale(i18n.language), true) })}
        </span>
      </div>

      <p className="max-w-2xl text-sm leading-relaxed text-foreground/90">{sentences.join(' ')}</p>
      <Learn />

      {yours.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 text-sm font-medium text-foreground">
            {t('filingGroupYours', { count: yours.length })}
          </h3>
          <ul className="rounded-xl border border-border/60 px-4">
            {yours.map((s) => <StockRow key={s.symbol} stock={s} />)}
          </ul>
        </>
      )}

      {rest.length > 0 && (
        <>
          <h3 className="mb-2 mt-6 text-sm font-medium text-foreground">
            {t(yours.length > 0 ? 'filingGroupOthers' : 'filingGroupAll', { count: rest.length })}
          </h3>
          <PagedStocks stocks={rest} />
        </>
      )}

      {earlier.length > 0 && (
        <>
          <h3 className="mb-2 mt-8 text-sm font-medium text-foreground">{t('filingEarlierTitle')}</h3>
          <ul className="rounded-xl border border-border/60 px-4">
            {earlier.map((d) => (
              <EarlierFiling key={d} trades={trades} day={d} owned={owned} watched={watched} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

/** Stocks in pages: the first few, then 25 more per click. */
function PagedStocks({ stocks, nested = false }: { stocks: FilingStock[]; nested?: boolean }) {
  const { t } = useTranslation('discover');
  const [shown, setShown] = useState(REST_FIRST);
  return (
    <>
      <ul className={nested ? 'border-t border-border/50' : 'rounded-xl border border-border/60 px-4'}>
        {stocks.slice(0, shown).map((s) => <StockRow key={s.symbol} stock={s} />)}
      </ul>
      {stocks.length > shown && (
        <button
          type="button"
          onClick={() => setShown((n) => n + REST_PAGE)}
          className="mt-2 flex w-full cursor-pointer items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
            <ChevronDown className="h-3.5 w-3.5" aria-hidden />
          </span>
          <span className="text-sm text-foreground/85">
            {t('filingShowMore', { count: Math.min(stocks.length - shown, REST_PAGE) })}
          </span>
        </button>
      )}
      {shown > REST_FIRST && (
        <button
          type="button"
          onClick={() => setShown(REST_FIRST)}
          className="mt-2 cursor-pointer rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('showLess')}
        </button>
      )}
    </>
  );
}

/**
 * One earlier filing as a single line (when it arrived, how many trades, made
 * when, buys against sells) that opens into the same per-stock rows. The rows
 * are built only once opened: an old filing can hold 500 trades nobody asked to see.
 */
function EarlierFiling({
  trades,
  day,
  owned,
  watched,
}: {
  trades: Trade[];
  day: string;
  owned: ReadonlySet<string>;
  watched: ReadonlySet<string>;
}) {
  const { t, i18n } = useTranslation('discover');
  const [open, setOpen] = useState(false);
  const filing = useMemo(() => buildFiling(trades, day, owned, watched), [trades, day, owned, watched]);
  if (!filing) return null;
  const locale = intlLocale(i18n.language);
  const made =
    filing.firstDate && filing.lastDate
      ? filing.firstDate === filing.lastDate
        ? formatDay(filing.firstDate, locale)
        : t('filingDates', { from: formatDay(filing.firstDate, locale), to: formatDay(filing.lastDate, locale) })
      : null;

  return (
    <li className="border-b border-border/50 last:border-b-0">
      <details className="group/filing" onToggle={(e) => setOpen(e.currentTarget.open)}>
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-md py-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">
              {t('filingArrived', { date: formatDay(filing.day, locale, true) })}
            </p>
            <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
              {t('filingEarlierLine', { count: filing.count })}
              {made && <> · {t('filingEarlierMade', { dates: made })}</>}
              {' · '}
              {t('filingBuysSells', { buys: filing.buys, sells: filing.sells })}
            </p>
          </div>
          <ChevronDown
            className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open/filing:rotate-180 motion-reduce:transition-none"
            aria-hidden
          />
        </summary>
        {open && (
          <div className="pb-3">
            <PagedStocks stocks={filing.stocks} nested />
          </div>
        )}
      </details>
    </li>
  );
}
