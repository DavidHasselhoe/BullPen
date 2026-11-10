'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowRight, Check, Plus } from 'lucide-react';
import { HomeSection, homePanel } from '@/components/dashboard/HomeSection';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { PoliticianAvatar } from '@/components/congress/PoliticianAvatar';
import { FundAvatar } from '@/components/institutions/FundAvatar';
import { FollowFundButton } from '@/components/institutions/FollowFundButton';
import { Change } from '@/components/dashboard/MoverRow';
import { useHomePortfolio } from '@/hooks/use-home-portfolio';
import { useAddToWatchlist, useWatchlist } from '@/hooks/use-watchlist';
import { inferAssetType, slugToAssetPath, symbolToSlug } from '@/lib/assets/asset-type';
import { fmtTradingDate, intlLocale } from '@/lib/dates/clock';
import { todayET } from '@/lib/dates/calendar-format';
import { fetchHoldingQuotes } from '@/lib/holdings/holding-quotes';
import { cn } from '@/lib/utils';
import type { Spotlight } from '@/app/api/stock/[ticker]/spotlight/route';

const PILLAR_KEY: Record<string, string> = {
  health_profitability: 'spotlightPillarProfitability',
  health_financial_strength: 'spotlightPillarStrength',
  health_cash_flow: 'spotlightPillarCashFlow',
  health_growth: 'spotlightPillarGrowth',
  health_market_risk: 'spotlightPillarStability',
};

/** A person, fund or company name that opens its page. */
const nameLink = 'rounded-sm text-sm font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Listed companies and funds only: a crypto pair or commodity has no score, filings or peers. */
const isListed = (symbol: string) => !symbol.includes('/') && ['stock', 'etf', 'unknown'].includes(inferAssetType(symbol));

/** "Q2 2026" from a quarter-end date. */
function quarterOf(iso: string): string {
  const [year, month] = iso.split('-').map(Number);
  return `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
}

/**
 * The person's biggest position, up close: what BullPen already knows about
 * it (health score, next earnings), who in Washington and on Wall Street
 * trades or holds it, with a Follow on each, and the largest companies in its
 * industry to watch. For a new account that owns one stock and follows nobody
 * this is most of Home, and each Follow or Watch feeds the sections around it.
 *
 * Everything comes from stored rows (api/stock/[ticker]/spotlight); no part of
 * it spends TwelveData credits. Parts with no data are left out, and the whole
 * section is when there is nothing to show.
 */
export function YourStockUpClose() {
  const { t, i18n } = useTranslation('discover');
  const { holdings, quotes, toUsd, pricesFailed } = useHomePortfolio();
  const { data: watchlist } = useWatchlist();

  // Biggest open position by value; until prices arrive a second holding
  // could still outrank the first, so wait rather than load the wrong stock.
  const anchor = useMemo(() => {
    const listed = holdings.filter((h) => isListed(h.symbol));
    if (listed.length > 1 && !quotes && !pricesFailed) return null;
    const value = (h: (typeof listed)[number]) => (quotes?.[h.symbol]?.price ?? 0) * (h.quantity ?? 0) * toUsd(h);
    const top = [...listed].sort((a, b) => value(b) - value(a))[0];
    if (top) return top.symbol;
    return (watchlist ?? []).find((w) => isListed(w.symbol))?.symbol ?? null;
  }, [holdings, quotes, pricesFailed, toUsd, watchlist]);

  const query = useQuery({
    queryKey: ['stock-spotlight', anchor],
    queryFn: async (): Promise<Spotlight> => {
      const res = await fetch(`/api/stock/${symbolToSlug(anchor!)}/spotlight`);
      if (!res.ok) throw new Error(`spotlight ${res.status}`);
      return (await res.json()).spotlight;
    },
    enabled: !!anchor,
    staleTime: 30 * 60 * 1000,
  });
  const s = query.data;

  const tracked = useMemo(() => new Set([...holdings.map((h) => h.symbol), ...(watchlist ?? []).map((w) => w.symbol)]), [holdings, watchlist]);
  const held = useMemo(() => new Set(holdings.map((h) => h.symbol)), [holdings]);
  const peers = (s?.peers ?? []).filter((p) => !held.has(p.symbol));
  const peerSymbols = peers.map((p) => p.symbol).sort();
  const { data: peerQuotes = {} } = useQuery({
    queryKey: ['spotlight-peer-quotes', peerSymbols],
    queryFn: () => fetchHoldingQuotes(peerSymbols, [], false),
    enabled: peerSymbols.length > 0,
    staleTime: 3 * 60 * 1000,
  });

  const add = useAddToWatchlist();
  const locale = intlLocale(i18n.language);

  if (!anchor) return null;

  if (query.isLoading) {
    return (
      <HomeSection title={t('spotlightTitleLoading')}>
        <div className={cn(homePanel, 'space-y-4 p-5')} aria-hidden>
          <div className="h-12 w-2/3 animate-shimmer rounded" />
          <div className="h-4 w-full animate-shimmer rounded" />
          <div className="h-4 w-5/6 animate-shimmer rounded" />
        </div>
      </HomeSection>
    );
  }
  if (query.isError || !s) {
    return (
      <HomeSection title={t('spotlightTitleLoading')}>
        <p className={cn(homePanel, 'p-5 text-sm text-muted-foreground')} role="alert">{t('spotlightError')}</p>
      </HomeSection>
    );
  }

  const hasGlance = !!s.health || !!s.nextEarnings;
  const hasWho = s.members.length > 0 || s.funds.length > 0;
  if (!hasGlance && !hasWho && peers.length === 0) return null;

  const earningsLine = (() => {
    const e = s.nextEarnings;
    if (!e) return null;
    const date = fmtTradingDate(new Date(`${e.date}T12:00:00Z`), { weekday: 'short', month: 'short', day: 'numeric' });
    const days = Math.round((Date.parse(e.date) - Date.parse(todayET())) / 86_400_000);
    const when = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(days, 'day');
    const session =
      e.estimated ? t('homeComingEarningsEstimated', { ticker: s.symbol })
      : e.time === 'BMO' || e.time === 'pre_market' ? t('homeComingEarningsBeforeOpen', { ticker: s.symbol })
      : e.time === 'AMC' || e.time === 'after_close' ? t('homeComingEarningsAfterClose', { ticker: s.symbol })
      : t('homeComingEarnings', { ticker: s.symbol });
    return { date, when, session };
  })();

  return (
    <HomeSection
      title={t('spotlightTitle', { name: s.name })}
      aside={
        <Link
          href={slugToAssetPath(s.symbol)}
          className="inline-flex items-center gap-1 py-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          {t('spotlightOpen', { symbol: s.symbol })}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      }
    >
      <div className={cn(homePanel, 'divide-y divide-border/60')}>
        {hasGlance && (
          <dl className="grid gap-5 p-5 sm:grid-cols-2">
            {s.health && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t('spotlightHealthLabel')}</dt>
                <dd className="mt-1.5">
                  <span className="min-w-0">
                    <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">{s.health.score}</span>
                    <span className="ml-1 text-sm text-muted-foreground">/ 100 · {s.health.grade}</span>
                    {(s.health.strongest || s.health.weakest) && (
                      <span className="block text-sm text-muted-foreground">
                        {s.health.strongest && t('spotlightStrongest', { pillar: t(PILLAR_KEY[s.health.strongest]) })}
                        {s.health.strongest && s.health.weakest && '. '}
                        {s.health.weakest && t('spotlightWeakest', { pillar: t(PILLAR_KEY[s.health.weakest]) })}
                      </span>
                    )}
                  </span>
                </dd>
              </div>
            )}
            {earningsLine && (
              <div>
                <dt className="text-xs font-medium text-muted-foreground">{t('spotlightEarningsLabel')}</dt>
                <dd className="mt-1.5">
                  <span className="text-2xl font-semibold tracking-tight text-foreground">{earningsLine.date}</span>
                  <span className="ml-2 text-sm text-muted-foreground">{earningsLine.when}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">{earningsLine.session}</span>
                </dd>
              </div>
            )}
          </dl>
        )}

        {hasWho && (
          <div className="p-5">
            <h3 className="text-sm font-semibold text-foreground">{t('spotlightWhoTitle', { symbol: s.symbol })}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{t('spotlightWhoHint')}</p>
            <ul className="mt-3 space-y-1">
              {s.members.map((m) => (
                <li key={m.slug} className="flex items-center gap-3 py-1.5">
                  <PoliticianAvatar displayName={m.displayName} slug={m.slug} size={32} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/discover/politicians/${m.slug}`} className={nameLink}>
                      {m.displayName}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {t(m.direction === 'buy' ? 'spotlightMemberBought' : m.direction === 'sell' ? 'spotlightMemberSold' : 'spotlightMemberTraded', {
                        date: fmtTradingDate(new Date(`${m.date}T12:00:00Z`), { month: 'short', day: 'numeric', year: 'numeric' }),
                      })}
                      {m.trades > 1 && ` · ${t('spotlightMemberTrades', { count: m.trades })}`}
                    </p>
                  </div>
                  <FollowFundButton slug={m.slug} displayName={m.displayName} kind="politician" inList />
                </li>
              ))}
              {s.funds.map((f) => (
                <li key={f.slug} className="flex items-center gap-3 py-1.5">
                  <FundAvatar displayName={f.name} logoUrl={f.logoUrl} size={32} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/discover/institutions/${f.slug}`} className={nameLink}>
                      {f.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">
                      {f.portfolioPct != null && f.portfolioPct > 0
                        ? t('spotlightFundHolds', {
                            pct: new Intl.NumberFormat(locale, { maximumFractionDigits: f.portfolioPct < 1 ? 2 : 1 }).format(f.portfolioPct),
                            quarter: quarterOf(f.periodOfReport),
                          })
                        : t('spotlightFundHoldsNoPct', { quarter: quarterOf(f.periodOfReport) })}
                    </p>
                  </div>
                  <FollowFundButton slug={f.slug} displayName={f.name} inList />
                </li>
              ))}
            </ul>
          </div>
        )}

        {peers.length > 0 && (
          <div className="p-5">
            <h3 className="text-sm font-semibold text-foreground">{t('spotlightPeersTitle')}</h3>
            <ul className="mt-3 grid gap-x-8 gap-y-1 sm:grid-cols-2">
              {peers.map((p) => {
                const q = peerQuotes[p.symbol];
                const pct = q && Number.isFinite(q.changePercent) ? q.changePercent : null;
                const watching = tracked.has(p.symbol);
                const failed = add.isError && add.variables?.symbol === p.symbol;
                return (
                  <li key={p.symbol} className="py-1.5">
                    <div className="flex items-center gap-3">
                      <CompanyLogo name={p.name} ticker={p.symbol} logoUrl={null} size={32} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        {/* clamp-ok: a company name in a two-column grid; full name in title */}
                        <Link href={slugToAssetPath(p.symbol)} className={cn(nameLink, 'block truncate')} title={p.name}>
                          {p.name}
                        </Link>
                        <span className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span className="font-mono">{p.symbol}</span>
                          {pct != null && <Change pct={pct} className="text-xs" />}
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={watching || (add.isPending && add.variables?.symbol === p.symbol)}
                        onClick={() => add.mutate({ symbol: p.symbol, company_name: p.name })}
                        aria-label={watching ? t('spotlightWatchingAria', { name: p.name }) : t('spotlightWatchAria', { name: p.name })}
                        className={cn(
                          'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors active:scale-[0.97]',
                          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default',
                          watching
                            ? 'border-border/60 bg-muted/50 text-foreground'
                            : 'border-border/60 text-foreground hover:border-border hover:bg-muted/40'
                        )}
                      >
                        {watching ? <Check className="h-3.5 w-3.5" aria-hidden /> : <Plus className="h-3.5 w-3.5" aria-hidden />}
                        {watching ? t('spotlightWatching') : t('spotlightWatch')}
                      </button>
                    </div>
                    {failed && (
                      <p role="alert" className="mt-2 text-xs text-destructive">{t('spotlightWatchFailed', { name: p.name })}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </HomeSection>
  );
}
