'use client';

/**
 * The Feed's rows and data, shared by /social and Home's "From who you follow"
 * section. Both read one query (queryKey ['social-feed', language]), so Home
 * warms the cache /social opens with.
 */

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import Image from 'next/image';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useAuth } from '@/hooks/use-auth';
import { Skeleton } from '@/components/ui/skeleton';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { FundAvatar } from '@/components/institutions/FundAvatar';
import { PoliticianAvatar } from '@/components/congress/PoliticianAvatar';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { fmtTradingDate, intlLocale } from '@/lib/dates/clock';
import { fetchHoldingQuotes } from '@/lib/holdings/holding-quotes';
import type { BatchQuote } from '@/lib/market-data/quote-batcher';
import type { FeedItem } from '@/app/api/social/feed/route';

type PoliticianItem = Extract<FeedItem, { kind: 'politician_trades' }>;

/** "3h ago" for a moment this week, the date after that. Filing and disclosure dates are date-only. */
function useWhen() {
  const { i18n } = useTranslation();
  const locale = intlLocale(i18n.language);
  return useMemo(() => {
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto', style: 'short' });
    return (value: string): string => {
      // A bare date means a trading day; noon UTC keeps it on that day in New York.
      const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
      const mins = Math.round((Date.now() - date.getTime()) / 60000);
      if (value.length > 10 && mins < 60) return rtf.format(-Math.max(mins, 0), 'minute');
      if (value.length > 10 && mins < 24 * 60) return rtf.format(-Math.round(mins / 60), 'hour');
      const sameYear = date.getUTCFullYear() === new Date().getUTCFullYear();
      return fmtTradingDate(date, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
    };
  }, [locale]);
}

/** "Q2 2026" from a quarter-end date. */
function quarterOf(iso: string): string {
  const [year, month] = iso.split('-').map(Number);
  return `Q${Math.floor((month - 1) / 3) + 1} ${year}`;
}

function TickerLink({ symbol, name }: { symbol: string; name?: string }) {
  return (
    <Link
      href={slugToAssetPath(symbol)}
      className="inline-flex items-center gap-1.5 font-semibold text-foreground hover:text-primary transition-colors align-bottom"
    >
      <CompanyLogo name={name ?? symbol} ticker={symbol} logoUrl={null} size={16} />
      {symbol}
    </Link>
  );
}

/** A name inside a translated sentence. Ignores children: Trans passes the tag's empty content. */
function Who({ href, name }: { href?: string; name: string; children?: React.ReactNode }) {
  return href ? (
    <Link href={href} className="font-semibold text-foreground hover:text-primary transition-colors">{name}</Link>
  ) : (
    <span className="font-semibold text-foreground">{name}</span>
  );
}

/** A figure inside a translated sentence, tabular like every other number. */
function Pct({ value }: { value: string; children?: React.ReactNode }) {
  return <span className="font-mono tabular-nums">{value}</span>;
}

function Row({ avatar, children, when }: { avatar: React.ReactNode; children: React.ReactNode; when: string }) {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-border/60 bg-card px-4 py-3.5">
      <div className="mt-0.5 shrink-0">{avatar}</div>
      <div className="min-w-0 flex-1 text-sm leading-relaxed">{children}</div>
      <span className="mt-0.5 shrink-0 text-xs text-muted-foreground">{when}</span>
    </li>
  );
}

function MemberAddRow({ item, t, when }: { item: Extract<FeedItem, { kind: 'member_add' }>; t: TFunction; when: string }) {
  const name = item.member.fullName || item.member.username || t('feedMemberFallback');
  const initials = name.slice(0, 2).toUpperCase();
  const avatar = item.member.avatarUrl ? (
    <Image src={item.member.avatarUrl} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" />
  ) : (
    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted/60 text-xs font-semibold text-muted-foreground" aria-hidden>
      {initials}
    </div>
  );
  const href = item.member.username ? `/users/${encodeURIComponent(item.member.username)}` : undefined;

  return (
    <Row avatar={avatar} when={when}>
      <div className="text-muted-foreground">
        <Trans
          i18nKey="feedMemberAdded"
          ns="user"
          components={{ who: <Who name={name} href={href} />, ticker: <TickerLink symbol={item.symbol} name={item.companyName} /> }}
        />
      </div>
    </Row>
  );
}

function FundFilingRow({ item, t, when }: { item: Extract<FeedItem, { kind: 'fund_filing' }>; t: TFunction; when: string }) {
  const href = `/discover/institutions/${item.fund.slug}`;
  return (
    <Row avatar={<FundAvatar displayName={item.fund.displayName} size={36} />} when={when}>
      <div className="text-muted-foreground">
        <Trans
          i18nKey="feedFundFiled"
          ns="user"
          values={{ quarter: quarterOf(item.periodOfReport) }}
          components={{ who: <Who name={item.fund.displayName} href={href} /> }}
        />
      </div>
      {item.teaser.headline && <p className="mt-1 text-foreground/85">{item.teaser.headline}</p>}
      {item.teaser.top.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
          <span>{t('feedFundTop')}</span>
          {item.teaser.top.map((h) =>
            h.symbol ? (
              <span key={h.symbol} className="inline-flex items-center gap-1.5">
                <TickerLink symbol={h.symbol} name={h.name} />
                <span className="font-mono tabular-nums">{h.pct.toFixed(1)}%</span>
              </span>
            ) : null
          )}
        </div>
      )}
      <Link href={href} className="mt-1 inline-block py-1.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
        {t('feedFundSeeFiling')}
      </Link>
    </Row>
  );
}

function PoliticianTradesRow({ item, t, when, quotes }: { item: PoliticianItem; t: TFunction; when: string; quotes: Record<string, BatchQuote> }) {
  const href = `/discover/politicians/${item.politician.slug}`;
  const more = item.total - item.trades.length;
  return (
    <Row avatar={<PoliticianAvatar displayName={item.politician.displayName} slug={item.politician.slug} size={36} />} when={when}>
      <div className="text-muted-foreground">
        <Trans
          i18nKey="feedPoliticianDisclosed"
          ns="user"
          count={item.total}
          components={{ who: <Who name={item.politician.displayName} href={href} /> }}
        />
      </div>
      <ul className="mt-2 space-y-1.5">
        {item.trades.map((trade, i) => {
          const price = quotes[trade.symbol]?.price;
          const since = price && trade.priceAtDisclosure ? ((price - trade.priceAtDisclosure) / trade.priceAtDisclosure) * 100 : null;
          return (
            <li key={`${trade.symbol}-${i}`} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm">
              <span className="w-12 shrink-0 text-muted-foreground">
                {trade.direction === 'buy' ? t('feedTradeBought') : trade.direction === 'sell' ? t('feedTradeSold') : t('feedTradeOther')}
              </span>
              <TickerLink symbol={trade.symbol} />
              <span className="font-mono text-xs tabular-nums text-muted-foreground">{trade.amount}</span>
              {since != null && (
                <span className={`text-xs ${since >= 0 ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  <Trans
                    i18nKey="feedSinceDisclosure"
                    ns="user"
                    components={{ pct: <Pct value={`${since >= 0 ? '+' : '−'}${Math.abs(since).toFixed(1)}%`} /> }}
                  />
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {more > 0 && (
        <Link href={href} className="mt-1 inline-block py-1.5 text-xs font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
          {t('feedPoliticianMore', { count: more })}
        </Link>
      )}
    </Row>
  );
}

export function FeedSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <ul className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-20 rounded-xl" />
      ))}
    </ul>
  );
}

/** The signed-in user's feed and the live prices its "since disclosed" lines need. */
export function useSocialFeed() {
  const { i18n } = useTranslation();
  const { isAuthenticated } = useAuth();
  const feedQuery = useQuery({
    queryKey: ['social-feed', i18n.language],
    queryFn: async (): Promise<FeedItem[]> => {
      const res = await fetch(`/api/social/feed?lang=${encodeURIComponent(i18n.language)}`);
      if (!res.ok) throw new Error(`feed ${res.status}`);
      const d = await res.json();
      return d.feed ?? [];
    },
    enabled: isAuthenticated,
    staleTime: 60_000,
    // Refetch when the user tabs back so the feed reflects what happened while they were away.
    refetchOnWindowFocus: 'always',
  });
  const feed = feedQuery.data;

  // Prices for "since disclosure": only the trades that carry a disclosure-day close.
  const tradeSymbols = useMemo(
    () => [...new Set((feed ?? []).flatMap((f) => (f.kind === 'politician_trades' ? f.trades.filter((tr) => tr.priceAtDisclosure).map((tr) => tr.symbol) : [])))].sort(),
    [feed]
  );
  const { data: quotes = {} } = useQuery({
    queryKey: ['social-feed-quotes', tradeSymbols],
    queryFn: () => fetchHoldingQuotes(tradeSymbols, [], false),
    enabled: tradeSymbols.length > 0,
    staleTime: 3 * 60_000,
    gcTime: 5 * 60_000,
  });

  return { feedQuery, quotes };
}

export function FeedList({ items, quotes }: { items: FeedItem[]; quotes: Record<string, BatchQuote> }) {
  const { t } = useTranslation('user');
  const when = useWhen();
  return (
    <ul className="space-y-2">
      {items.map((item) =>
        item.kind === 'member_add' ? (
          <MemberAddRow key={item.id} item={item} t={t} when={when(item.date)} />
        ) : item.kind === 'fund_filing' ? (
          <FundFilingRow key={item.id} item={item} t={t} when={when(item.date)} />
        ) : (
          <PoliticianTradesRow key={item.id} item={item} t={t} when={when(item.date)} quotes={quotes} />
        )
      )}
    </ul>
  );
}
