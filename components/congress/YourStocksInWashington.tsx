'use client';

/**
 * Tracked politicians' trades in the signed-in user's own holdings and
 * watchlist, last 90 days, built to be caught up on in a glance: one sentence
 * on the newest and busiest, then one row per stock (logo, who bought and who
 * sold, the faces, the date), each opening to who traded, when and how much.
 *
 * The cross-reference is the Pro tool. Free users see which of their stocks
 * were traded and the faces, but not who did what (the trades themselves stay
 * free on every stock and member page). Hidden when nothing overlaps.
 *
 * Buy and sell are neutral with an arrow, not emerald and red: those mean the
 * user's own gain and loss everywhere else, and a politician's buy is neither.
 */

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowDown, ArrowLeftRight, ArrowUp, ChevronDown } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { ProBadge } from '@/components/billing/ProBadge';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { PoliticianAvatar } from '@/components/congress/PoliticianAvatar';
import { formatAmountRange, tradeDirection } from '@/lib/congress/types';
import { groupOverlap, type OverlapPerson, type OverlapStock } from '@/lib/congress/overlap-groups';
import { displayCompanyName } from '@/lib/market-data/company-name';
import type { ActivityTrade } from '@/lib/congress/insights';
import { cn } from '@/lib/utils';

interface Person {
  slug: string;
  displayName: string;
}

interface OverlapResponse {
  locked: boolean;
  symbolCount: number;
  windowDays: number;
  held?: string[];
  names?: Record<string, string>;
  /** Pro. */
  trades?: ActivityTrade[];
  /** Free: the traded stocks newest first, and everyone who traded them. */
  symbols?: string[];
  people?: Person[];
}

const INITIAL_STOCKS = 5;
const FACES = 3;
const LOCKED_LOGOS = 8;

export function YourStocksInWashington() {
  const { t, i18n } = useTranslation('discover');
  const { isAuthenticated } = useAuth();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const { data } = useQuery({
    queryKey: ['congress-overlap'],
    queryFn: async (): Promise<OverlapResponse | null> => {
      const res = await fetch('/api/congress/overlap');
      if (!res.ok) return null;
      return res.json();
    },
    enabled: isAuthenticated,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (!data || data.symbolCount === 0) return null;

  const title = t('congOverlapTitle', { count: data.symbolCount, days: data.windowDays });
  const company = (symbol: string) => displayCompanyName(data.names?.[symbol] ?? symbol, symbol);
  const thisYear = new Date().getUTCFullYear();
  const fmtDate = (iso: string) => {
    const d = new Date(`${iso}T00:00:00Z`);
    return d.toLocaleDateString(i18n.language, {
      month: 'short',
      day: 'numeric',
      ...(d.getUTCFullYear() !== thisYear ? { year: 'numeric' } : {}),
      timeZone: 'UTC',
    });
  };

  if (data.locked) {
    const symbols = data.symbols ?? [];
    const people = data.people ?? [];
    return (
      <section aria-labelledby="overlap-heading" className="mb-6 rounded-xl border border-border/50 bg-card/40 p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
          <div className="min-w-0">
            <h3 id="overlap-heading" className="text-sm font-semibold text-foreground">
              {title} <ProBadge className="ml-1 align-middle" />
            </h3>
            {people.length > 0 && (
              <p className="mt-1 text-sm text-muted-foreground">{t('congOverlapLockedBody', { count: people.length })}</p>
            )}
          </div>
          <Link
            href="/upgrade"
            className="inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-lg border border-primary/30 bg-primary/5 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t('congOverlapSeeWho')}
          </Link>
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
          <ul className="flex flex-wrap items-center gap-2" aria-label={t('congOverlapLockedStocks')}>
            {symbols.slice(0, LOCKED_LOGOS).map((s) => (
              <li key={s} title={company(s)}>
                <Link href={`/stock/${s}`} className="block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <CompanyLogo ticker={s} name={company(s)} size={32} />
                  <span className="sr-only">{company(s)}</span>
                </Link>
              </li>
            ))}
            {symbols.length > LOCKED_LOGOS && (
              <li className="font-mono text-xs tabular-nums text-muted-foreground">+{symbols.length - LOCKED_LOGOS}</li>
            )}
          </ul>
          <Faces people={people} max={5} moreLabel={(n) => t('congOverlapMorePeople', { count: n })} />
        </div>
      </section>
    );
  }

  const stocks = groupOverlap(data.trades ?? [], new Set(data.held ?? []));
  if (stocks.length === 0) return null;

  // The catch-up sentence: the newest trade, and the stock with the most people on it.
  const newest = stocks[0].people[0];
  const newestDir = tradeDirection(newest.latest.tradeType);
  const busiest = stocks.reduce((a, b) => (b.people.length > a.people.length ? b : a));
  const shown = showAll ? stocks : stocks.slice(0, INITIAL_STOCKS);

  const toggle = (symbol: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });

  return (
    <section aria-labelledby="overlap-heading" className="mb-6 rounded-xl border border-border/50 bg-card/40">
      <div className="px-4 pt-4 sm:px-5">
        <h3 id="overlap-heading" className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(newestDir === 'buy' ? 'congOverlapNewestBuy' : newestDir === 'sell' ? 'congOverlapNewestSell' : 'congOverlapNewestOther', {
            name: newest.displayName,
            company: company(newest.latest.symbol),
            date: fmtDate(newest.latest.transactionDate),
          })}
          {busiest.people.length >= 2 && <> {t('congOverlapBusiest', { company: company(busiest.symbol), count: busiest.people.length })}</>}
        </p>
      </div>

      <ul className="mt-3 divide-y divide-border/50 border-t border-border/50">
        {shown.map((s) => (
          <StockRow
            key={s.symbol}
            stock={s}
            name={company(s.symbol)}
            isOpen={open.has(s.symbol)}
            onToggle={() => toggle(s.symbol)}
            fmtDate={fmtDate}
          />
        ))}
      </ul>

      {stocks.length > INITIAL_STOCKS && (
        <div className="border-t border-border/50 px-4 py-2.5 sm:px-5">
          <button
            type="button"
            onClick={() => setShowAll((v) => !v)}
            className="min-h-9 rounded-sm text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {showAll ? t('congOverlapShowFewer') : t('congOverlapShowAll', { count: stocks.length })}
          </button>
        </div>
      )}
    </section>
  );
}

function StockRow({
  stock,
  name,
  isOpen,
  onToggle,
  fmtDate,
}: {
  stock: OverlapStock;
  name: string;
  isOpen: boolean;
  onToggle: () => void;
  fmtDate: (iso: string) => string;
}) {
  const { t } = useTranslation('discover');
  const panelId = `overlap-${stock.symbol}`;
  return (
    <li>
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:px-5"
      >
        <CompanyLogo ticker={stock.symbol} name={name} size={36} />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-baseline gap-2">
            {/* clamp-ok: a company name in a dense row; the ticker and the stock page carry the rest */}
            <span className="truncate text-sm font-semibold text-foreground" title={name}>{name}</span>
            <span className="shrink-0 font-mono text-xs text-muted-foreground">{stock.symbol}</span>
            <span className="shrink-0 text-xs text-muted-foreground">· {stock.held ? t('congOverlapOwned') : t('congOverlapWatching')}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-xs tabular-nums text-muted-foreground">
            {stock.buyers > 0 && (
              <span className="inline-flex items-center gap-1 text-foreground">
                <ArrowUp className="h-3 w-3" aria-hidden />
                {t('congOverlapBuyers', { count: stock.buyers })}
              </span>
            )}
            {stock.sellers > 0 && (
              <span className="inline-flex items-center gap-1 text-foreground">
                <ArrowDown className="h-3 w-3" aria-hidden />
                {t('congOverlapSellers', { count: stock.sellers })}
              </span>
            )}
            <span className="whitespace-nowrap">{t('congOverlapLatest', { date: fmtDate(stock.latestDate) })}</span>
          </span>
        </span>
        <Faces people={stock.people} max={FACES} moreLabel={(n) => t('congOverlapMorePeople', { count: n })} />
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-180')} aria-hidden />
      </button>

      {isOpen && (
        <ul id={panelId} aria-label={t('congOverlapWhoTraded', { company: name })} className="max-w-3xl px-4 pb-2 sm:pl-[68px] sm:pr-5">
          {stock.people.map((p) => (
            <PersonRow key={p.slug} person={p} fmtDate={fmtDate} />
          ))}
          <li className="pt-1">
            <Link
              href={`/stock/${stock.symbol}`}
              className="inline-flex min-h-9 items-center rounded-sm text-xs font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t('congOverlapOpenStock', { company: name })}
            </Link>
          </li>
        </ul>
      )}
    </li>
  );
}

function PersonRow({ person, fmtDate }: { person: OverlapPerson; fmtDate: (iso: string) => string }) {
  const { t } = useTranslation('discover');
  const tr = person.latest;
  const dir = tradeDirection(tr.tradeType);
  const Icon = dir === 'buy' ? ArrowUp : dir === 'sell' ? ArrowDown : ArrowLeftRight;
  const asset = /^option/i.test(tr.assetType ?? '') ? t('congOverlapOption') : /^bond/i.test(tr.assetType ?? '') ? t('congOverlapBond') : null;
  return (
    <li className="flex items-center gap-3 border-t border-border/40 py-2.5 first:border-t-0">
      <PoliticianAvatar displayName={person.displayName} slug={person.slug} size={28} />
      <div className="min-w-0 flex-1">
        <Link
          href={`/discover/politicians/${person.slug}`}
          className="block truncate rounded-sm text-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {/* clamp-ok: a person's name in a dense row */}
          {person.displayName}
        </Link>
        {/* Each fact stays whole: a wrap may fall between them, never inside "filed Oct 12". */}
        <p className="text-xs tabular-nums text-muted-foreground">
          <span className="whitespace-nowrap">{t('congOverlapTradedOn', { date: fmtDate(tr.transactionDate) })}</span>
          {tr.disclosureDate && <> · <span className="whitespace-nowrap">{t('congOverlapFiledOn', { date: fmtDate(tr.disclosureDate) })}</span></>}
          {person.count > 1 && <> · <span className="whitespace-nowrap">{t('congOverlapTradeCount', { count: person.count })}</span></>}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
          <Icon className="h-3 w-3" aria-hidden />
          {dir === 'buy' ? t('congOverlapVerbBuy') : dir === 'sell' ? t('congOverlapVerbSell') : t('congOverlapVerbOther')}
          {asset && <span className="font-normal text-muted-foreground">({asset})</span>}
        </span>
        <p className="font-mono text-xs tabular-nums text-muted-foreground">{formatAmountRange(tr.amountLow, tr.amountHigh, tr.amountRange)}</p>
      </div>
    </li>
  );
}

/** Overlapping headshots, newest first, with a count for the rest. Decorative: the names are in the rows. */
function Faces({ people, max, moreLabel, className }: { people: Person[]; max: number; moreLabel: (n: number) => string; className?: string }) {
  if (people.length === 0) return null;
  const extra = people.length - max;
  return (
    <span className={cn('flex shrink-0 items-center', className)} aria-hidden>
      {people.slice(0, max).map((p, i) => (
        <span key={p.slug} className={cn('rounded-full ring-2 ring-background', i > 0 && '-ml-2')} title={p.displayName}>
          <PoliticianAvatar displayName={p.displayName} slug={p.slug} size={26} />
        </span>
      ))}
      {extra > 0 && (
        <span
          className="-ml-2 flex h-[26px] min-w-[26px] items-center justify-center rounded-full bg-muted px-1.5 font-mono text-xs tabular-nums text-muted-foreground ring-2 ring-background"
          title={moreLabel(extra)}
        >
          +{extra}
        </span>
      )}
    </span>
  );
}
