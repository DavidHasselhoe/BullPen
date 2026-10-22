'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Landmark, Lock, Trophy } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { getRows, sessionRank } from '@/components/dashboard/ComingUp';
import { useIntlLocale } from '@/hooks/use-intl-locale';
import { addDays, todayET } from '@/lib/dates/calendar-format';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { tradeDirection } from '@/lib/congress/types';
import type { IndexChangeEvent } from '@/lib/market-data/index-events';
import type { ListCongressTrade } from '@/app/api/watchlist/lists/[listId]/events/route';

/** Rows before "+N more": a glance, not a second calendar. */
const MAX_ROWS = 6;

const INDEX_LABEL = { sp500: 'indexBadgeSp500', nasdaq100: 'indexBadgeNasdaq100', dow30: 'indexBadgeDow30' } as const;

type Row =
  | { kind: 'earnings'; date: string; symbol: string; name: string; logoUrl: string | null; time?: string; estimated?: boolean }
  | { kind: 'dividend'; date: string; symbol: string; name: string; logoUrl: string | null }
  | { kind: 'index'; date: string; symbol: string; event: IndexChangeEvent }
  | { kind: 'congress'; date: string; symbol: string; trade: ListCongressTrade };

/**
 * "This week on your list": the next 7 days of earnings and ex-dividend dates
 * for the list's stocks (the same calendar reads and wording as Home's Coming
 * up), then the last 7 days of index joins and exits and newly public congress
 * trades. Who traded is Pro; a free account sees how many. Hidden when empty.
 */
export function ListEvents({ listId, symbols }: { listId: string; symbols: string[] }) {
  const { t } = useTranslation('watchlist');
  const { t: tHome } = useTranslation('discover');
  const { t: tStock } = useTranslation('stock');
  const locale = useIntlLocale();
  const [showAll, setShowAll] = useState(false);

  const today = todayET();
  const symbolsParam = [...symbols].sort().join(',');

  const { data } = useQuery({
    queryKey: ['watchlist-events', listId, today, symbolsParam],
    queryFn: async () => {
      const range = `from=${today}&to=${addDays(today, 6)}&symbols=${encodeURIComponent(symbolsParam)}`;
      const [earnings, dividends, recent] = await Promise.all([
        getRows<{ symbol: string; name?: string; date: string; time?: string; date_estimated?: boolean; logo_url?: string | null }>(`/api/calendar/earnings?${range}`),
        getRows<{ symbol: string; name?: string; ex_dividend_date: string; logo_url?: string | null }>(`/api/calendar/dividends?${range}`),
        fetch(`/api/watchlist/lists/${listId}/events`).then((r) => r.json()) as Promise<{
          success: boolean; index?: IndexChangeEvent[]; congress?: ListCongressTrade[]; congressLocked?: number;
        }>,
      ]);
      const upcoming: Row[] = [
        ...earnings.map((e): Row => ({ kind: 'earnings', date: e.date, symbol: e.symbol, name: e.name || e.symbol, logoUrl: e.logo_url ?? null, time: e.time, estimated: e.date_estimated })),
        ...dividends.map((d): Row => ({ kind: 'dividend', date: d.ex_dividend_date, symbol: d.symbol, name: d.name || d.symbol, logoUrl: d.logo_url ?? null })),
      ].sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'earnings' ? sessionRank(a.time) : -1) - (b.kind === 'earnings' ? sessionRank(b.time) : -1));
      const past: Row[] = [
        ...(recent.index ?? []).map((e): Row => ({ kind: 'index', date: e.detectedOn, symbol: e.ticker, event: e })),
        ...(recent.congress ?? []).map((tr): Row => ({ kind: 'congress', date: tr.disclosureDate, symbol: tr.symbol, trade: tr })),
      ].sort((a, b) => b.date.localeCompare(a.date));
      return { rows: [...upcoming, ...past], congressLocked: recent.congressLocked ?? 0 };
    },
    enabled: symbols.length > 0,
    staleTime: 30 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  if (!data || (data.rows.length === 0 && data.congressLocked === 0)) return null;
  const shown = showAll ? data.rows : data.rows.slice(0, MAX_ROWS);
  const hidden = data.rows.length - shown.length;

  const dayLabel = (d: string) => {
    if (d === today) return tHome('homeComingToday');
    if (d === addDays(today, 1)) return tHome('homeComingTomorrow');
    if (d === addDays(today, -1)) return t('eventsYesterday');
    return new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  };

  const describe = (r: Row) => {
    if (r.kind === 'dividend') return tHome('homeComingDividend', { ticker: r.symbol });
    if (r.kind === 'earnings') {
      if (r.estimated) return tHome('homeComingEarningsEstimated', { ticker: r.symbol });
      const s = sessionRank(r.time);
      return tHome(s === 0 ? 'homeComingEarningsBeforeOpen' : s === 2 ? 'homeComingEarningsAfterClose' : 'homeComingEarnings', { ticker: r.symbol });
    }
    if (r.kind === 'index') {
      return t(r.event.change === 'added' ? 'eventsIndexJoined' : 'eventsIndexLeft', { ticker: r.symbol, index: tStock(INDEX_LABEL[r.event.indexId]) });
    }
    const dir = tradeDirection(r.trade.tradeType);
    return t(dir === 'buy' ? 'eventsCongressBought' : dir === 'sell' ? 'eventsCongressSold' : 'eventsCongressTraded', { name: r.trade.displayName, ticker: r.symbol });
  };

  const rowClass = 'flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-muted/60';

  return (
    <section aria-labelledby="list-events-title" className="flex flex-col gap-2">
      <h2 id="list-events-title" className="text-sm font-semibold text-foreground">{t('eventsTitle')}</h2>
      <ul className="grid gap-1 rounded-xl bg-muted/40 p-1.5 lg:grid-cols-2">
        {shown.map((r, i) => {
          const body = (
            <>
              <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">{dayLabel(r.date)}</span>
              {r.kind === 'congress' ? (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Landmark className="h-3.5 w-3.5" aria-hidden /></span>
              ) : r.kind === 'index' ? (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Trophy className="h-3.5 w-3.5" aria-hidden /></span>
              ) : (
                <CompanyLogo ticker={r.symbol} name={r.name} logoUrl={r.logoUrl} size={24} />
              )}
              <span className="min-w-0 flex-1 text-sm text-foreground">{describe(r)}</span>
            </>
          );
          const href = r.kind === 'congress' ? `/discover/politicians/${r.trade.slug}` : slugToAssetPath(r.symbol);
          return (
            <li key={`${r.kind}-${r.symbol}-${r.date}-${i}`}>
              <Link href={href} className={rowClass}>{body}</Link>
            </li>
          );
        })}
        {data.congressLocked > 0 && (
          <li>
            <Link href="/upgrade" className={rowClass}>
              <span className="w-20 shrink-0 text-xs font-medium text-muted-foreground">{t('eventsThisWeek')}</span>
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground"><Lock className="h-3.5 w-3.5" aria-hidden /></span>
              <span className="min-w-0 flex-1 text-sm text-foreground">{t('eventsCongressLocked', { count: data.congressLocked })}</span>
            </Link>
          </li>
        )}
      </ul>
      {hidden > 0 && (
        <button type="button" onClick={() => setShowAll(true)} className="w-fit rounded-md py-1 text-xs font-medium text-primary transition-colors hover:text-primary/80">
          {t('eventsMore', { count: hidden })}
        </button>
      )}
    </section>
  );
}
