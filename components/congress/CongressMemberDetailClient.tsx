'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { ArrowDownRight, ArrowLeft, ArrowUpRight, ChevronDown, Info } from 'lucide-react';
import { InstitutionalHoldingsPieChart } from '@/components/institutions/InstitutionalHoldingsPieChart';
import { ALLOCATION_TOP_N, buildAllocation } from '@/lib/institutions/allocation';
import { positionLine } from '@/lib/congress/member-list';
import { formatAmountRange, isFiledLate, moveBeforeDisclosure, tradeDirection } from '@/lib/congress/types';
import { cn } from '@/lib/utils';
import { ControlSelect } from '@/components/ui/ControlSelect';
import { DisclosureNote } from './DisclosureNote';
import { FollowFundButton } from '@/components/institutions/FollowFundButton';
import { PoliticianScorecard } from './PoliticianScorecard';
import { ListSearch } from './ListSearch';
import { PoliticianAvatar } from './PoliticianAvatar';
import type { CongressMemberDetail, CongressHoldingRow } from '@/app/api/congress/[slug]/route';
import type { CongressTradeRow } from '@/lib/congress/types';

type TradeFilter = 'all' | 'buy' | 'sell';

const ALL_YEARS = 'all';

/** How many more positions each "Show more" reveals. */
const REST_PAGE = 25;

/** Labels are discover.json's memberFilter_<key>. */
const FILTERS: TradeFilter[] = ['all', 'buy', 'sell'];

function compactUsd(n: number): string {
  // Estimated values only (see migration 150) — rendered compactly on purpose.
  // "$53,300,729.38" would claim a precision that a chain of bracket midpoints
  // cannot support.
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1000) return `$${Math.round(n / 1000)}K`;
  return `$${Math.round(n)}`;
}

/** The trade's year, or its filing's when the trade date is unknown. */
function tradeYear(t: CongressTradeRow): string {
  return (t.transactionDate ?? t.disclosureDate ?? '').slice(0, 4);
}

function formatDate(iso: string | null, locale: string): string | null {
  if (!iso) return null;
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(locale, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Options positions, which are kept out of the allocation donut.
 *
 * Same rule buildAllocation already applies to 13F filings, and for the same
 * reason: an option's value is not comparable to a share position's, so
 * charting them together makes a bet on a stock read as owning the stock. It
 * matters more here, because the vendor gives no option fields on a position
 * at all, so we cannot even tell whether its value is the premium paid or the
 * notional it covers.
 *
 * Rare but high-impact: exactly one of 3,601 stored positions is an option,
 * and it is 69.7% of that member's book.
 */
function isOptionPosition(h: CongressHoldingRow): boolean {
  return /\b(call|put)\s+option/i.test(h.companyName ?? '');
}

/** Map an estimated congressional position onto the shape buildAllocation and
 *  the donut already speak. `cusip` is the allocation key, and a ticker is a
 *  stable one here; congressional filings have no CUSIP at all. */
function toDiffable(h: CongressHoldingRow) {
  return {
    cusip: h.symbol,
    putCall: null,
    symbol: h.symbol,
    nameOfIssuer: h.companyName ?? h.symbol,
    valueUsd: h.currentValue ?? 0,
    shares: h.estimatedShares ?? 0,
    portfolioPct: null,
  };
}

function TradeRow({ t }: { t: CongressTradeRow & { symbol: string } }) {
  const { t: tr, i18n } = useTranslation('discover');
  const dir = tradeDirection(t.tradeType);
  const isBuy = dir === 'buy';
  const isSell = dir === 'sell';
  const Icon = isBuy ? ArrowUpRight : isSell ? ArrowDownRight : Info;
  const late = isFiledLate(t.daysToDisclose);
  const move = moveBeforeDisclosure(t);

  return (
    <li className="flex items-start gap-3 border-b border-border/50 py-3 last:border-b-0">
      <span
        className={cn(
          'mt-0.5 inline-flex w-[5.25rem] shrink-0 items-center gap-1 rounded-md px-1.5 py-1 text-xs font-medium',
          // Light mode needs the darker step: emerald-400 on white computes to
          // about 1.7:1 and red-400 to 2.8:1, both far under AA, because these
          // were picked looking at the dark theme only. HoldingsBarList's
          // -600/dark:-400 pairing is the convention here.
          isBuy
            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : isSell
              ? 'bg-red-500/10 text-red-600 dark:text-red-400'
              : 'bg-muted/50 text-muted-foreground',
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
        {isBuy ? tr('memberBought') : isSell ? tr('memberSold') : t.tradeType}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <div className="flex min-w-0 items-baseline gap-2">
            <Link
              href={`/stock/${t.symbol}`}
              className="shrink-0 rounded-sm font-mono text-sm font-semibold tabular-nums text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {t.symbol}
            </Link>
            {/* clamp-ok: company name beside its ticker; hidden on phones
                where there is no width for it to be legible */}
            <span
              className="hidden truncate text-xs text-muted-foreground sm:inline"
              title={t.assetDescription}
            >
              {t.assetDescription}
            </span>
          </div>
          <p className="shrink-0 font-mono text-sm tabular-nums text-foreground">
            {formatAmountRange(t.amountLow, t.amountHigh, t.amountRange)}
          </p>
        </div>
        <p className="mt-0.5 text-right text-xs tabular-nums text-muted-foreground">
          {/* A filed date after the filing itself is unknown (isPlausibleTradeDate),
              so the row says when it was reported instead of inventing a trade day. */}
          {t.transactionDate
            ? formatDate(t.transactionDate, i18n.language)
            : tr('memberDateUnknown', { date: formatDate(t.disclosureDate, i18n.language) ?? tr('memberUndated') })}
          {t.daysToDisclose != null && (
            <span className={cn('ml-1.5', late && 'text-amber-600 dark:text-amber-400')}>
              {tr(late ? 'memberFiledLate' : 'memberFiledLater', { count: t.daysToDisclose })}
            </span>
          )}
        </p>
        {move != null && (
          <p
            className="mt-0.5 text-right text-xs tabular-nums text-muted-foreground"
            title={tr('memberMoveTitle')}
          >
            {tr('memberMoveWhenPublic', { from: t.priceAtTrade!.toFixed(2), to: t.priceAtDisclosure!.toFixed(2) })}{' '}
            <span className={cn('font-medium', move >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}>
              {move >= 0 ? '+' : ''}{move.toFixed(1)}%
            </span>
          </p>
        )}
      </div>
    </li>
  );
}

export function CongressMemberDetailClient({ slug }: { slug: string }) {
  const { t } = useTranslation('discover');
  const [filter, setFilter] = useState<TradeFilter>('all');
  const [year, setYear] = useState(ALL_YEARS);
  const [tradeQuery, setTradeQuery] = useState('');
  const [holdingQuery, setHoldingQuery] = useState('');
  const [holdingsShown, setHoldingsShown] = useState(ALLOCATION_TOP_N);
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ['congress-member', slug] as const,
    queryFn: async (): Promise<{ success: boolean; member: CongressMemberDetail }> => {
      const res = await fetch(`/api/congress/${slug}`);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      return res.json();
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const member = data?.member;

  const priced = useMemo(
    () => (member?.holdings ?? []).filter((h) => (h.currentValue ?? 0) > 0),
    [member],
  );

  const optionPositions = useMemo(() => priced.filter(isOptionPosition), [priced]);

  const allocation = useMemo(() => {
    const shares = priced.filter((h) => !isOptionPosition(h));
    return shares.length > 0 ? buildAllocation(shares.map(toDiffable)) : null;
  }, [priced]);

  /** Top wedges plus the tail, in one list, so "N more positions" is reachable. */
  const allHoldings = useMemo(
    () => (allocation ? [...allocation.top, ...allocation.rest] : []),
    [allocation],
  );

  const visibleHoldings = useMemo(() => {
    const q = holdingQuery.trim().toLowerCase();
    // Searching reaches the whole book, not just the page currently expanded —
    // otherwise a hit in position 200 would be invisible until you paged to it.
    if (q) {
      return allHoldings.filter(
        (h) =>
          h.symbol?.toLowerCase().includes(q) || h.name.toLowerCase().includes(q),
      );
    }
    return allHoldings.slice(0, holdingsShown);
  }, [allHoldings, holdingQuery, holdingsShown]);

  const hiddenHoldings = Math.max(0, allHoldings.length - holdingsShown);

  const tradesWithTicker = useMemo(
    () =>
      (member?.trades ?? []).filter((t): t is CongressTradeRow & { symbol: string } => !!t.symbol),
    [member],
  );

  /** Years present in this member's trades, newest first. Derived, never a
   *  fixed range: members' histories start and end in different years. */
  const yearOptions = useMemo(() => {
    const years = [...new Set(tradesWithTicker.map((t) => tradeYear(t)))]
      .filter(Boolean)
      .sort()
      .reverse();
    return [{ value: ALL_YEARS, label: t('memberAllYears') }, ...years.map((y) => ({ value: y, label: y }))];
  }, [tradesWithTicker, t]);

  const counts = useMemo(
    () => ({
      all: tradesWithTicker.length,
      buy: tradesWithTicker.filter((t) => tradeDirection(t.tradeType) === 'buy').length,
      sell: tradesWithTicker.filter((t) => tradeDirection(t.tradeType) === 'sell').length,
    }),
    [tradesWithTicker],
  );

  const visibleTrades = useMemo(() => {
    const q = tradeQuery.trim().toLowerCase();
    return tradesWithTicker.filter(
      (t) =>
        (filter === 'all' || tradeDirection(t.tradeType) === filter) &&
        (year === ALL_YEARS || tradeYear(t) === year) &&
        (!q ||
          t.symbol.toLowerCase().includes(q) ||
          t.assetDescription.toLowerCase().includes(q)),
    );
  }, [tradesWithTicker, filter, year, tradeQuery]);

  /** Median move between trade and disclosure across this member's buys. A
   *  median of real per-trade closes, so one outlier cannot carry it; hidden
   *  under 5 buys where it would say nothing. */
  const buyGap = useMemo(() => {
    const moves = tradesWithTicker
      .filter((t) => tradeDirection(t.tradeType) === 'buy')
      .map(moveBeforeDisclosure)
      .filter((m): m is number => m != null)
      .sort((a, b) => a - b);
    if (moves.length < 5) return null;
    const mid = Math.floor(moves.length / 2);
    const median = moves.length % 2 ? moves[mid] : (moves[mid - 1] + moves[mid]) / 2;
    return { median, count: moves.length };
  }, [tradesWithTicker]);

  const tradeFiltersActive = year !== ALL_YEARS || tradeQuery.trim() !== '' || filter !== 'all';

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy>
        <div className="h-14 w-64 animate-pulse rounded bg-muted/60" />
        <div className="h-72 animate-pulse rounded-xl bg-muted/40" />
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="rounded-xl border border-dashed border-border/60 px-6 py-12 text-center">
        <p className="text-sm text-foreground">{t('memberLoadError')}</p>
        <Link
          href="/discover"
          className="mt-3 inline-block text-sm text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
        >
          {t('backToDiscover')}
        </Link>
      </div>
    );
  }

  return (
    <div>
      <Link
        href="/discover"
        className="mb-5 inline-flex items-center gap-1.5 rounded-sm text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('headerTitle')}
      </Link>

      <header className="mb-6 flex items-center gap-4">
        <PoliticianAvatar displayName={member.displayName} slug={member.slug} size={64} />
        <div className="min-w-0 flex-1">
          {/* Weight and tracking match InstitutionalFundDetailClient's h1, so
              the two drill-down pages read as the same kind of page. */}
          <h1 className="text-xl font-bold tracking-tight text-foreground">
            {member.displayName}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{positionLine(member, t)}</p>
        </div>
        <FollowFundButton kind="politician" slug={member.slug} displayName={member.displayName} />
      </header>

      <PoliticianScorecard slug={member.slug} displayName={member.displayName} />

      {/* ---------------- Estimated portfolio ---------------- */}
      <section aria-labelledby="congress-holdings-heading" className="mb-10">
        <h2
          id="congress-holdings-heading"
          className="mb-1 text-sm font-semibold uppercase tracking-widest text-muted-foreground"
        >
          {t('memberEstimatedPortfolio')}
        </h2>

        {allocation ? (
          <>
            {/* The vendor's own caveat, stored with the snapshot it describes
                (migration 150) and shown above the chart rather than under it.
                These numbers are reconstructed from the midpoint of each filed
                bracket, so the chart is not the same class of fact as a 13F
                donut and must not be read as one. */}
            {member.holdingsDisclaimer && (
              <p className="mb-3 flex max-w-2xl items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>{member.holdingsDisclaimer}</span>
              </p>
            )}
            <InstitutionalHoldingsPieChart
              allocation={allocation}
              totalValueUsd={allocation.total}
              highlightedKey={highlightedKey}
              onHighlight={setHighlightedKey}
              // Not a 13F. Calling a bracket-midpoint reconstruction the same
              // thing as a filed institutional value would be the exact
              // category error migration 150 warns about.
              centerLabel={t('memberEstimatedValue')}
            />
            <div className="mt-4 mb-2 flex flex-wrap items-center justify-between gap-2">
              <ListSearch
                id="congress-holdings-search"
                value={holdingQuery}
                onChange={setHoldingQuery}
                placeholder={t('memberFilterPlaceholder')}
                label={t('memberFilterPositionsLabel')}
              />
              <p className="text-xs tabular-nums text-muted-foreground" aria-live="polite">
                {holdingQuery
                  ? t('memberPositionsFiltered', { count: allHoldings.length, shown: visibleHoldings.length })
                  : t('memberPositions', { count: allHoldings.length })}
              </p>
            </div>

            {visibleHoldings.length === 0 ? (
              <p className="rounded-xl border border-dashed border-border/60 px-6 py-8 text-center text-sm text-foreground">
                {t('memberNoPositionMatch', { query: holdingQuery })}
              </p>
            ) : (
            <ul className="space-y-1.5">
              {visibleHoldings.map((h) => (
                <li
                  key={h.key}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-muted/40"
                  onMouseEnter={() => setHighlightedKey(h.key)}
                  onMouseLeave={() => setHighlightedKey(null)}
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: h.color }}
                    aria-hidden
                  />
                  <Link
                    href={`/stock/${h.symbol}`}
                    className="w-16 shrink-0 rounded-sm font-mono text-sm font-semibold tabular-nums text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {h.symbol}
                  </Link>
                  {/* clamp-ok: company name in a dense allocation row */}
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={h.name}>
                    {h.name}
                  </span>
                  {/* Column widths and weights follow HoldingsBarList's rows,
                      so the two allocation lists line up as one pattern. */}
                  <span className="ml-auto shrink-0 pl-2 font-mono text-xs tabular-nums text-muted-foreground">
                    ~{compactUsd(h.valueUsd)}
                  </span>
                  <span className="w-[4.5rem] shrink-0 text-right font-mono text-sm font-semibold tabular-nums text-foreground">
                    {h.pct.toFixed(1)}%
                  </span>
                </li>
              ))}
            </ul>
            )}

            {/* The donut's legend promises "N more positions" but the list
                above is capped at ALLOCATION_TOP_N, so without this the rest
                were counted and coloured and then unreachable. Paged rather
                than dumped: Gilbert Cisneros holds 388. */}
            {!holdingQuery && hiddenHoldings > 0 && (
              <button
                type="button"
                onClick={() => setHoldingsShown((n) => n + REST_PAGE)}
                // The remaining count is a second visual column, so without
                // this the name concatenates to "...positions25 remaining".
                aria-label={t('memberShowMoreAria', { count: Math.min(hiddenHoldings, REST_PAGE), remaining: hiddenHoldings })}
                className="mt-2 flex w-full items-center gap-3 rounded-md px-2 py-2.5 text-left transition-colors hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted/60 text-muted-foreground">
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden />
                </span>
                <span className="text-sm text-foreground/85">
                  {t('memberShowMore', { count: Math.min(hiddenHoldings, REST_PAGE) })}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {t('memberRemaining', { formatted: hiddenHoldings.toLocaleString('en-US') })}
                  </span>
                </span>
              </button>
            )}

            {!holdingQuery && hiddenHoldings === 0 && holdingsShown > ALLOCATION_TOP_N && (
              <button
                type="button"
                onClick={() => setHoldingsShown(ALLOCATION_TOP_N)}
                className="mt-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('showLess')}
              </button>
            )}

            {/* Named rather than silently dropped. Excluding them from the
                chart is a valuation decision, not a reason to pretend the
                position is not there. */}
            {optionPositions.length > 0 && (
              <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground">
                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                <span>
                  {t('memberOptionsNote', { names: optionPositions.map((h) => h.companyName ?? h.symbol).join(', ') })}
                </span>
              </p>
            )}
          </>
        ) : (
          <div className="rounded-xl border border-dashed border-border/60 px-6 py-10 text-center">
            <p className="text-sm text-foreground">{t('memberNoEstimate')}</p>
            <p className="mx-auto mt-1.5 max-w-md text-xs leading-relaxed text-muted-foreground">
              {t('memberNoEstimateHint')}
            </p>
          </div>
        )}
      </section>

      {/* ---------------- Disclosed trades ---------------- */}
      <section aria-labelledby="congress-trades-heading" className="mb-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2
            id="congress-trades-heading"
            className="text-sm font-semibold uppercase tracking-widest text-muted-foreground"
          >
            {t('memberDisclosedTrades')}
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <ListSearch
              id="congress-trades-search"
              value={tradeQuery}
              onChange={setTradeQuery}
              placeholder={t('memberFilterPlaceholder')}
              label={t('memberFilterTradesLabel')}
            />
            {yearOptions.length > 2 && (
              <ControlSelect
                id="congress-trade-year"
                label={t('memberYearLabel')}
                value={year}
                onChange={setYear}
                options={yearOptions}
                width="sm:w-[130px]"
              />
            )}
          <div className="flex items-center gap-1" role="group" aria-label={t('memberDirectionGroup')}>
            {FILTERS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                aria-pressed={filter === f}
                // Without this the accessible name concatenates to "Buys55".
                // The count is a separate visual column, not part of the word.
                aria-label={t('memberDirectionAria', { label: t(`memberFilter_${f}`), count: counts[f] })}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  filter === f
                    ? 'border-border bg-muted/60 text-foreground'
                    : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
                )}
              >
                {t(`memberFilter_${f}`)}
                <span className="font-mono text-xs tabular-nums text-muted-foreground">
                  {counts[f]}
                </span>
              </button>
            ))}
            </div>
          </div>
        </div>

        {/* The member pages are publicly crawlable, so a reader can land here
            from search without ever passing the Discover section that carries
            this. The lag is the single most misreadable thing about the data. */}
        <div className="mb-3">
          <DisclosureNote compact />
        </div>

        {buyGap && (
          <p className="mb-4 text-sm text-muted-foreground">
            <Trans
              t={t}
              i18nKey="memberBuyGap"
              count={buyGap.count}
              values={{ pct: `${buyGap.median >= 0 ? '+' : ''}${buyGap.median.toFixed(1)}%` }}
              components={[
                <span
                  key="pct"
                  className={cn('font-mono font-semibold tabular-nums', buyGap.median >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400')}
                />,
                <span key="count" className="tabular-nums" />,
              ]}
            />
          </p>
        )}

        {visibleTrades.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/60 px-6 py-10 text-center">
            {/* Separates "we hold nothing for this member" from "your filters
                excluded everything", which need different recoveries. */}
            <p className="text-sm text-foreground">
              {tradeFiltersActive ? t('memberNoTradesMatch') : t('memberNoTrades')}
            </p>
            {tradeFiltersActive && (
              <button
                type="button"
                onClick={() => {
                  setFilter('all');
                  setYear(ALL_YEARS);
                  setTradeQuery('');
                }}
                className="mt-2 text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {t('discoverClearFilters')}
              </button>
            )}
          </div>
        ) : (
          <ul className="rounded-xl border border-border/60 px-4">
            {visibleTrades.map((t) => (
              <TradeRow key={t.id} t={t} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
