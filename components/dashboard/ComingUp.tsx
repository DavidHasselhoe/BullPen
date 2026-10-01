'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, CalendarClock, Landmark } from 'lucide-react';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { HomeSection, homePanel } from '@/components/dashboard/HomeSection';
import { useHomePortfolio } from '@/hooks/use-home-portfolio';
import { useIntlLocale } from '@/hooks/use-intl-locale';
import { addDays, todayET } from '@/lib/dates/calendar-format';
import { fmtReleaseTimeShort, type EconomicEvent, type EconomicKind } from '@/lib/market-data/economic-kinds';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { cn } from '@/lib/utils';

const DAYS_AHEAD = 7;
const MAX_ROWS = 6;
/** Releases that move the whole market. Weekly jobless claims and the smaller
 *  BLS prints stay on the full calendar, or they'd crowd out the user's own stocks. */
const HOME_KINDS: EconomicKind[] = ['fomc', 'cpi', 'jobs', 'pce', 'gdp'];

type Row =
  | { kind: 'earnings'; date: string; symbol: string; name: string; logoUrl: string | null; time?: string; estimated?: boolean }
  | { kind: 'dividend'; date: string; symbol: string; name: string; logoUrl: string | null }
  | { kind: 'economic'; date: string; event: EconomicEvent };

/** Earnings session order within a day: before the open, unknown, after the close. */
const sessionRank = (time?: string) =>
  time === 'BMO' || time === 'pre_market' ? 0 : time === 'AMC' || time === 'after_close' ? 2 : 1;

/** Throws on failure, so a broken feed reads as an error, never as "nothing scheduled". */
async function getRows<T>(path: string): Promise<T[]> {
  const res = await fetch(path);
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.success) throw new Error(`calendar ${res.status}`);
  return (json.data as T[]) ?? [];
}

/**
 * The next week, as it concerns this person: their stocks' earnings and
 * ex-dividend dates, plus the handful of economic releases that move
 * everything. Plain words instead of BMO/AMC. Amounts are left to the full
 * calendar: the dividend feed is global and a cross-listing can carry another
 * currency's figure under the same symbol.
 */
export function ComingUp() {
  const { t } = useTranslation('discover');
  const { t: tTools } = useTranslation('tools');
  const locale = useIntlLocale();
  const { symbols, isLoading: homeLoading } = useHomePortfolio();

  const from = todayET();
  const to = addDays(from, DAYS_AHEAD - 1);
  const symbolsParam = symbols.join(',');

  const { data: rows, isLoading, isError } = useQuery({
    queryKey: ['home-coming-up', from, symbolsParam],
    queryFn: async (): Promise<Row[]> => {
      const range = `from=${from}&to=${to}`;
      const mine = symbolsParam ? `&symbols=${encodeURIComponent(symbolsParam)}` : '';
      const [earnings, dividends, economic] = await Promise.all([
        mine
          ? getRows<{ symbol: string; name?: string; date: string; time?: string; date_estimated?: boolean; logo_url?: string | null }>(`/api/calendar/earnings?${range}${mine}`)
          : [],
        mine
          ? getRows<{ symbol: string; name?: string; ex_dividend_date: string; logo_url?: string | null }>(`/api/calendar/dividends?${range}${mine}`)
          : [],
        getRows<EconomicEvent>(`/api/calendar/economic?${range}`),
      ]);
      return [
        ...earnings.map((e): Row => ({ kind: 'earnings', date: e.date, symbol: e.symbol, name: e.name || e.symbol, logoUrl: e.logo_url ?? null, time: e.time, estimated: e.date_estimated })),
        ...dividends.map((d): Row => ({ kind: 'dividend', date: d.ex_dividend_date, symbol: d.symbol, name: d.name || d.symbol, logoUrl: d.logo_url ?? null })),
        ...economic.filter((e) => HOME_KINDS.includes(e.kind)).map((e): Row => ({ kind: 'economic', date: e.date, event: e })),
      ];
    },
    enabled: !homeLoading,
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const sorted = useMemo(() => {
    const order = (r: Row) =>
      r.kind === 'economic' ? new Date(r.event.release_at).getTime() % 86_400_000 : r.kind === 'earnings' ? sessionRank(r.time) : -1;
    return [...(rows ?? [])]
      .sort((a, b) => a.date.localeCompare(b.date) || order(a) - order(b))
      .slice(0, MAX_ROWS);
  }, [rows]);

  const dayLabel = (d: string) => {
    if (d === from) return t('homeComingToday');
    if (d === addDays(from, 1)) return t('homeComingTomorrow');
    return new Date(`${d}T12:00:00Z`).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
  };

  const describe = (r: Row) => {
    if (r.kind === 'economic') {
      return t('homeComingEconomic', { name: tTools(`economicName_${r.event.kind}`), time: fmtReleaseTimeShort(r.event.release_at) });
    }
    if (r.kind === 'dividend') return t('homeComingDividend', { ticker: r.symbol });
    if (r.estimated) return t('homeComingEarningsEstimated', { ticker: r.symbol });
    const s = sessionRank(r.time);
    return t(s === 0 ? 'homeComingEarningsBeforeOpen' : s === 2 ? 'homeComingEarningsAfterClose' : 'homeComingEarnings', { ticker: r.symbol });
  };

  const aside = (
    <Link href="/tools/calendar" className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground">
      {t('homeComingFullCalendar')}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );

  if (homeLoading || isLoading) {
    return (
      <HomeSection title={t('homeComingTitle')} aside={aside}>
        <div className={cn(homePanel, 'space-y-3 p-5')} aria-hidden>
          {[0, 1, 2].map((i) => <div key={i} className="h-5 w-full animate-shimmer rounded" />)}
        </div>
      </HomeSection>
    );
  }

  return (
    <HomeSection title={t('homeComingTitle')} aside={aside}>
      {isError ? (
        <p className={cn(homePanel, 'p-5 text-sm text-muted-foreground')}>{t('homeComingError')}</p>
      ) : sorted.length === 0 ? (
        <p className={cn(homePanel, 'p-5 text-sm text-muted-foreground')}>
          {symbols.length > 0 ? t('homeComingEmpty') : t('homeComingEmptyNoStocks')}
        </p>
      ) : (
        <ul className={cn(homePanel, 'divide-y divide-border/60')}>
          {sorted.map((r) => {
            const key = r.kind === 'economic' ? r.event.id : `${r.kind}-${r.symbol}-${r.date}`;
            const body = (
              <>
                <span className="w-24 shrink-0 text-xs font-medium text-muted-foreground">{dayLabel(r.date)}</span>
                {r.kind === 'economic' ? (
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    {r.event.kind === 'fomc' ? <Landmark className="h-3.5 w-3.5" aria-hidden /> : <CalendarClock className="h-3.5 w-3.5" aria-hidden />}
                  </span>
                ) : (
                  <CompanyLogo ticker={r.symbol} name={r.name} logoUrl={r.logoUrl} size={24} />
                )}
                <span className="min-w-0 flex-1 text-sm text-foreground">{describe(r)}</span>
              </>
            );
            return (
              <li key={key}>
                {r.kind === 'economic' ? (
                  <div className="flex items-center gap-3 px-5 py-3">{body}</div>
                ) : (
                  <Link href={slugToAssetPath(r.symbol)} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-muted/40">
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </HomeSection>
  );
}
