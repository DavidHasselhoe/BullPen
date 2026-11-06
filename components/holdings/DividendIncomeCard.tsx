'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import { Coins, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ProBadge } from '@/components/billing/ProBadge';
import { useIntlLocale } from '@/hooks/use-intl-locale';
import type { DividendEvent, IncomeMonth } from '@/lib/dividends/dividend-income';

interface HubHolding {
  symbol: string;
  name: string;
  shares: number | null;
  next: DividendEvent | null;
  last: DividendEvent | null;
  nextTotal: number | null;
}
interface HubResponse {
  success: boolean;
  today: string;
  pro: boolean;
  holdings: HubHolding[];
  missing: string[];
  yearPaymentCount: number;
  year: { months: IncomeMonth[]; total: number; hasProjected: boolean; unknownShares: string[] } | null;
}

const FIRST_HOLDINGS = 6;
const FIRST_MONTHS = 3;

/**
 * Dividend hub on My holdings. Free: each paying holding's next payment.
 * Pro: the next 12 months of announced and projected payments by month.
 * Amounts are in USD, the currency the payments are made in.
 */
export function DividendIncomeCard({ symbols }: { symbols: string[] }) {
  const { t } = useTranslation('holdings');
  const locale = useIntlLocale();
  const [allHoldings, setAllHoldings] = useState(false);
  const [allMonths, setAllMonths] = useState(false);
  const symbolsKey = useMemo(() => [...symbols].sort().join(','), [symbols]);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['holdings-dividends', symbolsKey],
    queryFn: async (): Promise<HubResponse> => {
      const res = await fetch('/api/holdings/dividends');
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'failed');
      return json;
    },
    staleTime: 30 * 60 * 1000,
  });

  // Payday notifications link to /holdings#dividends. The browser's own hash
  // scroll fires before this card exists, so land on it once it has data.
  const landed = useRef(false);
  const ready = !!data;
  useEffect(() => {
    if (!ready || landed.current || window.location.hash !== '#dividends') return;
    landed.current = true;
    // Effects run after commit, so the card is in the DOM. Browser scroll anchoring
    // keeps it in place as sections above finish loading.
    document.getElementById('dividends')?.scrollIntoView({ block: 'start' });
  }, [ready]);

  const fmt = useMemo(() => {
    const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' });
    const day = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
    const monthLong = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return {
      money: (n: number) => money.format(n),
      day: (d: string) => day.format(new Date(`${d}T12:00:00Z`)),
      month: (m: string) => month.format(new Date(`${m}-15T12:00:00Z`)),
      monthLong: (m: string) => monthLong.format(new Date(`${m}-15T12:00:00Z`)),
    };
  }, [locale]);

  const header = (
    <CardHeader className="pb-3">
      <CardTitle role="heading" aria-level={2} className="flex items-center gap-2 text-base font-semibold">
        <Coins className="h-4 w-4 text-muted-foreground" aria-hidden />
        {t('dividendHubTitle')}
      </CardTitle>
    </CardHeader>
  );

  if (isLoading) {
    return (
      <Card id="dividends" className="scroll-mt-24" aria-busy="true">
        {header}
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card id="dividends" className="scroll-mt-24">
        {header}
        <CardContent>
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{t('dividendHubError')}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} aria-hidden />
              {t('dividendHubRetry')}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  const holdings = allHoldings ? data.holdings : data.holdings.slice(0, FIRST_HOLDINGS);

  return (
    <Card id="dividends" className="scroll-mt-24">
      {header}
      <CardContent className="space-y-6">
        {data.holdings.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('dividendHubNone')}</p>
        ) : (
          <>
            {data.year && <YearView year={data.year} fmt={fmt} allMonths={allMonths} onAllMonths={() => setAllMonths(true)} today={data.today} />}

            <section aria-labelledby="dividend-next-heading" className={data.year ? 'border-t border-border/60 pt-6' : undefined}>
              <h3 id="dividend-next-heading" className="text-sm font-semibold">{t('dividendHubNextHeading')}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{t('dividendHubExplainer')}</p>
              <ul className="mt-3 divide-y divide-border/60">
                {holdings.map((h) => (
                  <li key={h.symbol} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 py-3">
                    <div className="min-w-0">
                      <Link href={`/stock/${h.symbol}`} className="relative rounded-sm font-mono text-sm font-semibold underline-offset-4 after:absolute after:-inset-x-2 after:-inset-y-3 after:content-[''] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        {h.symbol}
                      </Link>
                      {/* clamp-ok: company name in a dense row; full name is the title */}
                      <p className="max-w-[16rem] truncate text-xs text-muted-foreground" title={h.name}>{h.name}</p>
                    </div>
                    {h.next ? (
                      <div className="sm:text-right">
                        <p className="text-sm">
                          {h.nextTotal != null ? (
                            <Trans t={t} i18nKey="dividendHubYouGet" values={{ amount: fmt.money(h.nextTotal) }} components={{ n: <span className="font-mono font-semibold tabular-nums" /> }} />
                          ) : (
                            <span className="tabular-nums">{t('dividendHubPerShare', { amount: fmt.money(h.next.amount) })}</span>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground tabular-nums">
                          {h.next.payDate ? t('dividendHubPays', { date: fmt.day(h.next.payDate) }) : t('dividendHubPayDateUnknown')}
                          {' · '}
                          {t('dividendHubExDate', { date: fmt.day(h.next.exDate) })}
                          {h.nextTotal != null && <>{' · '}{t('dividendHubPerShare', { amount: fmt.money(h.next.amount) })}</>}
                        </p>
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground tabular-nums sm:text-right">
                        {t('dividendHubNotAnnounced')}
                        {h.last && <><br />{t('dividendHubLastPaid', { amount: fmt.money(h.last.amount), date: fmt.day(h.last.payDate ?? h.last.exDate) })}</>}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
              {!allHoldings && data.holdings.length > FIRST_HOLDINGS && (
                <Button variant="ghost" size="sm" className="-ml-3 mt-1 min-h-11" onClick={() => setAllHoldings(true)}>
                  {t('dividendHubShowAll', { count: data.holdings.length })}
                </Button>
              )}
            </section>

            {!data.pro && data.yearPaymentCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border/70 bg-muted/20 p-4">
                <div className="min-w-0">
                  <p className="text-sm font-semibold">
                    {t('dividendHubLockedTitle', { count: data.yearPaymentCount })} <ProBadge className="ml-1 align-middle" />
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{t('dividendHubLockedBody')}</p>
                </div>
                <Link
                  href="/upgrade?from=dividend_hub"
                  className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-lg border border-primary/30 bg-primary/5 px-3 text-xs font-medium text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {t('dividendHubLockedCta')}
                </Link>
              </div>
            )}
          </>
        )}

        {data.missing.length > 0 && (
          <p className="text-xs text-muted-foreground">{t('dividendHubMissing', { list: data.missing.join(', ') })}</p>
        )}
      </CardContent>
    </Card>
  );
}

type Fmt = { money: (n: number) => string; day: (d: string) => string; month: (m: string) => string; monthLong: (m: string) => string };

function YearView({ year, fmt, allMonths, onAllMonths, today }: {
  year: NonNullable<HubResponse['year']>; fmt: Fmt; allMonths: boolean; onAllMonths: () => void; today: string;
}) {
  const { t } = useTranslation('holdings');
  const sums = year.months.map((m) => ({
    month: m.month,
    announced: m.entries.filter((e) => e.kind === 'announced').reduce((s, e) => s + (e.total ?? 0), 0),
    projected: m.entries.filter((e) => e.kind === 'projected').reduce((s, e) => s + (e.total ?? 0), 0),
  }));
  const max = Math.max(...sums.map((s) => s.announced + s.projected), 0);
  const withPayments = year.months.filter((m) => m.entries.length > 0);
  const shown = allMonths ? withPayments : withPayments.slice(0, FIRST_MONTHS);
  const first = year.months[0].month;
  const last = year.months[year.months.length - 1].month;

  return (
    <section aria-labelledby="dividend-year-heading" className="space-y-4">
      <div>
        <h3 id="dividend-year-heading" className="text-sm font-semibold">{t('dividendHubYearHeading', { from: fmt.monthLong(first), to: fmt.monthLong(last) })}</h3>
        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">{fmt.money(year.total)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {year.hasProjected ? t('dividendHubYearNoteProjected') : t('dividendHubYearNoteAnnounced')}
        </p>
      </div>

      {max > 0 && (
        <div>
          {/* Visual only; the month list below carries the same numbers for screen readers. */}
          <div className="grid grid-cols-12 items-end gap-1 sm:gap-2" aria-hidden>
            {sums.map((s) => (
              <div key={s.month} className="flex flex-col items-center gap-1">
                <div className="flex h-20 w-full flex-col justify-end">
                  {s.projected > 0 && (
                    <div className="w-full rounded-t-sm border border-dashed border-foreground/40 bg-foreground/10" style={{ height: `${(s.projected / max) * 100}%` }} />
                  )}
                  {s.announced > 0 && (
                    <div className={`w-full bg-foreground/80 ${s.projected > 0 ? '' : 'rounded-t-sm'}`} style={{ height: `${(s.announced / max) * 100}%` }} />
                  )}
                </div>
                <span className="text-[11px] text-muted-foreground">{fmt.month(s.month)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-foreground/80" />{t('dividendHubAnnounced')}</span>
            {year.hasProjected && (
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-foreground/40 bg-foreground/10" />{t('dividendHubProjected')}</span>
            )}
          </div>
        </div>
      )}

      <ul className="space-y-3">
        {shown.map((m) => (
          <li key={m.month}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium">{fmt.monthLong(m.month)}</span>
              <span className="font-mono tabular-nums">{fmt.money(m.total)}</span>
            </div>
            <ul className="mt-1 space-y-0.5">
              {m.entries.map((e) => (
                <li key={`${e.symbol}-${e.exDate}`} className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                  <span>
                    <span className="font-mono text-foreground">{e.symbol}</span>{' '}
                    {e.date < today
                      ? t('dividendHubPaidOn', { date: fmt.day(e.date) })
                      : e.payDate ? t('dividendHubPays', { date: fmt.day(e.payDate) }) : t('dividendHubExDate', { date: fmt.day(e.exDate) })}
                    {e.kind === 'projected' && <> · {t('dividendHubProjectedTag')}</>}
                  </span>
                  <span className="font-mono tabular-nums">{e.total != null ? fmt.money(e.total) : t('dividendHubPerShare', { amount: fmt.money(e.perShare) })}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
      {!allMonths && withPayments.length > FIRST_MONTHS && (
        <Button variant="ghost" size="sm" className="-ml-3 min-h-11" onClick={onAllMonths}>
          {t('dividendHubShowAllMonths')}
        </Button>
      )}
      {year.unknownShares.length > 0 && (
        <p className="text-xs text-muted-foreground">{t('dividendHubUnknownShares', { list: year.unknownShares.join(', ') })}</p>
      )}
    </section>
  );
}
