'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { Coins, EyeOff, Maximize2, MoreHorizontal, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { ProBadge } from '@/components/billing/ProBadge';
import { useIntlLocale } from '@/hooks/use-intl-locale';
import { useUserSettings } from '@/hooks/use-user-settings';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import { weekRangeOf } from '@/lib/dates/calendar-format';
import { displayCompanyName } from '@/lib/market-data/company-name';
import type { DividendEvent, IncomeEntry, IncomeMonth } from '@/lib/dividends/dividend-income';

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
  excluded: string[];
  yearPaymentCount: number;
  year: { months: IncomeMonth[]; total: number; hasProjected: boolean; unknownShares: string[] } | null;
}

type Fmt = {
  money: (n: number) => string;
  rounded: (n: number) => string;
  day: (d: string) => string;
  month: (m: string) => string;
  monthLong: (m: string) => string;
};

const PREVIEW_TILES = 4;
const DAY_MS = 86_400_000;
const noSubscribe = () => () => {};

/**
 * Dividends on My holdings: the next four paydays in a ~200px preview, with
 * the full picture behind Expand, like the performance calendar above it. A
 * calendar week would be blank nearly every week for a quarterly payer, so
 * "this week" is the opening sentence and the tiles run forward from today.
 *
 * Free: each paying holding's next announced payment. Pro: the next 12 months
 * of announced and projected payments. Amounts are in USD, the currency the
 * payments are made in. No paying holdings means no card at all.
 */
export function DividendIncomeCard({ symbols }: { symbols: string[] }) {
  const { t } = useTranslation('holdings');
  const locale = useIntlLocale();
  const { dividendsHidden, setDividendsHidden } = useUserSettings();
  const [expanded, setExpanded] = useState(false);
  const [showUndo, setShowUndo] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const symbolsKey = useMemo(() => [...symbols].sort().join(','), [symbols]);

  // A payday notification opens the card for that visit even if it's hidden,
  // so the link never lands on nothing. Server snapshot false: no hash there.
  const fromNotification = useSyncExternalStore(noSubscribe, () => window.location.hash === '#dividends', () => false);
  const off = dividendsHidden && !fromNotification;

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ['holdings-dividends', symbolsKey],
    queryFn: async (): Promise<HubResponse> => {
      const res = await fetch('/api/holdings/dividends');
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? 'failed');
      return json;
    },
    staleTime: 30 * 60 * 1000,
    enabled: !off,
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

  const fmt = useMemo<Fmt>(() => {
    const money = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD' });
    const whole = new Intl.NumberFormat(locale, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
    const day = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' });
    const month = new Intl.DateTimeFormat(locale, { month: 'short', timeZone: 'UTC' });
    const monthLong = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return {
      money: (n) => money.format(n),
      rounded: (n) => (n >= 10 ? whole.format(n) : money.format(n)),
      day: (d) => day.format(new Date(`${d}T12:00:00Z`)),
      month: (m) => month.format(new Date(`${m}-15T12:00:00Z`)),
      monthLong: (m) => monthLong.format(new Date(`${m}-15T12:00:00Z`)),
    };
  }, [locale]);

  const save = async (hide: boolean) => {
    setSaving(true);
    setSaveFailed(false);
    try {
      await setDividendsHidden(hide);
      setShowUndo(hide);
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  if (showUndo) {
    return (
      <Card id="dividends" className="scroll-mt-24 gap-1 py-3">
        <CardContent className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p role="status" className="text-sm text-muted-foreground">{t('dividendHubHidden')}</p>
          <Button variant="ghost" size="sm" className="-mr-2 min-h-11 sm:min-h-9" autoFocus disabled={saving} onClick={() => save(false)}>
            {t('dividendHubUndo')}
          </Button>
        </CardContent>
        {saveFailed && <CardContent><p role="alert" className="text-xs text-destructive">{t('dividendHubSaveError')}</p></CardContent>}
      </Card>
    );
  }

  if (off) return null;

  const header = (withExpand: boolean) => (
    <CardHeader className="flex items-center justify-between gap-3">
      <CardTitle role="heading" aria-level={2} className="flex items-center gap-2 text-base font-semibold">
        <Coins className="h-4 w-4 text-muted-foreground" aria-hidden />
        {t('dividendHubTitle')}
      </CardTitle>
      <div className="flex items-center gap-1">
        {withExpand && (
          <Button variant="outline" size="sm" className="relative text-xs after:absolute after:-inset-y-2 after:inset-x-0 after:content-['']" onClick={() => setExpanded(true)}>
            <Maximize2 className="h-3.5 w-3.5" aria-hidden />
            {t('perfCalExpand')}
          </Button>
        )}
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="relative h-9 w-9 text-muted-foreground after:absolute after:-inset-1 after:content-['']" aria-label={t('dividendHubMenu')}>
              <MoreHorizontal className="h-4 w-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem disabled={saving} onSelect={() => save(true)}>
              <EyeOff className="h-4 w-4" aria-hidden />
              {t('dividendHubHide')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </CardHeader>
  );
  const saveError = saveFailed && <p role="alert" className="mt-2 text-xs text-destructive">{t('dividendHubSaveError')}</p>;

  if (isLoading) {
    return (
      <Card id="dividends" className="scroll-mt-24 gap-3 py-5" aria-busy="true">
        {header(false)}
        <CardContent>
          <Skeleton className="mb-3 h-5 w-64 max-w-full" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: PREVIEW_TILES }).map((_, i) => <Skeleton key={i} className="h-[90px] rounded-lg max-sm:[&:nth-child(n+3)]:hidden" />)}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (isError || !data) {
    return (
      <Card id="dividends" className="scroll-mt-24 gap-3 py-5">
        {header(false)}
        <CardContent>
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span>{t('dividendHubError')}</span>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} aria-hidden />
              {t('dividendHubRetry')}
            </Button>
          </div>
          {saveError}
        </CardContent>
      </Card>
    );
  }

  if (data.holdings.length === 0) {
    if (data.missing.length === 0) return null;
    return (
      <Card id="dividends" className="scroll-mt-24 gap-3 py-5">
        {header(false)}
        <CardContent>
          <p className="text-xs text-muted-foreground">{t('dividendHubMissing', { list: data.missing.join(', ') })}</p>
          {saveError}
        </CardContent>
      </Card>
    );
  }

  const nameOf = (symbol: string) => data.holdings.find((h) => h.symbol === symbol)?.name ?? symbol;
  const upcoming: IncomeEntry[] = data.year
    ? data.year.months.flatMap((m) => m.entries).filter((e) => e.date >= data.today)
    : data.holdings.flatMap((h) => (h.next ? [nextEntry(h, h.next)] : []));
  const tiles = upcoming.slice(0, PREVIEW_TILES);
  const waiting = data.holdings
    .filter((h) => !h.next && !tiles.some((e) => e.symbol === h.symbol))
    .slice(0, PREVIEW_TILES - tiles.length);
  const yearTotal = upcoming.reduce((s, e) => s + (e.total ?? 0), 0);

  return (
    <Card id="dividends" className="scroll-mt-24 gap-3 py-5">
      {header(true)}
      <CardContent>
        <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
          <p className="text-muted-foreground"><WeekLine upcoming={upcoming} today={data.today} fmt={fmt} /></p>
          {data.year && yearTotal > 0 && (
            <p className="text-xs text-muted-foreground">
              {t(data.year.hasProjected ? 'dividendHubYearAbout' : 'dividendHubYearExact', { amount: fmt.rounded(yearTotal) })}
            </p>
          )}
        </div>
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map((e) => (
            <Tile key={`${e.symbol}-${e.exDate}`} symbol={e.symbol} name={nameOf(e.symbol)} amount={<Amount entry={e} fmt={fmt} />} detail={tileDetail(e, t, fmt)} />
          ))}
          {waiting.map((h) => (
            <Tile
              key={h.symbol}
              symbol={h.symbol}
              name={h.name}
              amount={<span className="text-sm text-muted-foreground">{t('dividendHubNotAnnouncedShort')}</span>}
              detail={h.last ? t('dividendHubLastPaidShort', { date: fmt.day(h.last.payDate ?? h.last.exDate) }) : ''}
            />
          ))}
        </ul>
        {saveError}
      </CardContent>

      <Dialog open={expanded} onOpenChange={setExpanded}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coins className="h-4 w-4 text-muted-foreground" aria-hidden />
              {t('dividendHubTitle')}
            </DialogTitle>
          </DialogHeader>
          <Details data={data} upcoming={upcoming} nameOf={nameOf} fmt={fmt} />
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function nextEntry(h: HubHolding, next: DividendEvent): IncomeEntry {
  return { symbol: h.symbol, exDate: next.exDate, payDate: next.payDate, date: next.payDate ?? next.exDate, perShare: next.amount, total: h.nextTotal, kind: 'announced' };
}

/** "Nothing pays this week. Next payday Dec 10, in 31 days." Only a known pay date counts as a payday. */
function WeekLine({ upcoming, today, fmt }: { upcoming: IncomeEntry[]; today: string; fmt: Fmt }) {
  const { t } = useTranslation('holdings');
  const b = { b: <span className="font-medium text-foreground" /> };
  const weekEnd = weekRangeOf(today).to;
  const thisWeek = upcoming.filter((e) => e.payDate && e.payDate <= weekEnd);
  const weekTotal = thisWeek.reduce((s, e) => s + (e.total ?? 0), 0);

  if (weekTotal > 0) {
    const key = thisWeek.some((e) => e.kind === 'projected') ? 'dividendHubWeekAbout' : 'dividendHubWeekAmount';
    return <Trans t={t} i18nKey={key} values={{ amount: fmt.money(weekTotal) }} components={b} />;
  }
  if (thisWeek.length > 0) return <>{t('dividendHubWeekCount', { count: thisWeek.length })}</>;

  const next = upcoming.find((e) => e.payDate);
  if (!next) return <>{t('dividendHubNothingAnnounced')}</>;
  const count = Math.round((Date.parse(next.payDate!) - Date.parse(today)) / DAY_MS);
  return (
    <>
      {t('dividendHubNothingThisWeek')}{' '}
      <Trans t={t} i18nKey={next.kind === 'projected' ? 'dividendHubNextPaydayAbout' : 'dividendHubNextPayday'} count={count} values={{ date: fmt.day(next.payDate!), count }} components={b} />
    </>
  );
}

/** Confirmed money is a gain the holder can count on: emerald with its "+". An estimate stays neutral and says so. */
function Amount({ entry, fmt }: { entry: IncomeEntry; fmt: Fmt }) {
  const { t } = useTranslation('holdings');
  if (entry.total == null) {
    return <span className="font-mono text-sm tabular-nums text-muted-foreground">{t('dividendHubPerShare', { amount: fmt.money(entry.perShare) })}</span>;
  }
  if (entry.kind === 'projected') {
    return <span className="font-mono text-sm tabular-nums text-muted-foreground">{t('dividendHubAbout', { amount: fmt.money(entry.total) })}</span>;
  }
  return <span className="font-mono text-sm font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">+{fmt.money(entry.total)}</span>;
}

function tileDetail(e: IncomeEntry, t: TFunction<'holdings'>, fmt: Fmt): string {
  const projected = e.kind === 'projected';
  if (!e.payDate) return t(projected ? 'dividendHubEstEx' : 'dividendHubExDate', { date: fmt.day(e.exDate) });
  return t(projected ? 'dividendHubEstPays' : 'dividendHubPays', { date: fmt.day(e.payDate) });
}

/** What the holder needs to know about one payment, in words. */
function rowDetail(e: IncomeEntry, today: string, t: TFunction<'holdings'>, fmt: Fmt): string {
  if (e.date < today) return t('dividendHubPaidOn', { date: fmt.day(e.date) });
  if (e.kind === 'projected' || !e.payDate) return tileDetail(e, t, fmt);
  return e.exDate > today
    ? t('dividendHubPaysKeep', { date: fmt.day(e.payDate), ex: fmt.day(e.exDate) })
    : t('dividendHubPaysLocked', { date: fmt.day(e.payDate) });
}

function Tile({ symbol, name, amount, detail }: { symbol: string; name: string; amount: ReactNode; detail: string }) {
  return (
    <li className="min-w-0 max-sm:[&:nth-child(n+3)]:hidden">
      <Link
        href={slugToAssetPath(symbol)}
        title={symbol}
        className="flex h-full flex-col gap-1.5 rounded-lg bg-muted/40 p-2.5 transition-colors hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 items-start gap-2">
          <CompanyLogo ticker={symbol} name={name} size={24} decorative />
          <span className="min-w-0 text-sm font-medium leading-6">{displayCompanyName(name, symbol)}</span>
        </span>
        {' '}
        <span className="mt-auto block">
          <span className="block">{amount}</span>
          {' '}
          <span className="block text-xs text-muted-foreground tabular-nums">{detail}</span>
        </span>
      </Link>
    </li>
  );
}

function Row({ symbol, name, detail, amount }: { symbol: string; name: string; detail: string; amount: ReactNode }) {
  return (
    <li>
      <Link href={slugToAssetPath(symbol)} className="-mx-2 flex items-center gap-3 rounded-md px-2 py-2 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <CompanyLogo ticker={symbol} name={name} size={28} decorative />
        <span className="min-w-0 flex-1">
          <span className="text-sm font-medium">{displayCompanyName(name, symbol)}</span>
          {' '}
          <span className="font-mono text-xs text-muted-foreground">{symbol}</span>
          {' '}
          <span className="block text-xs text-muted-foreground tabular-nums">{detail}</span>
        </span>
        {' '}
        <span className="shrink-0 text-right">{amount}</span>
      </Link>
    </li>
  );
}

function Details({ data, upcoming, nameOf, fmt }: { data: HubResponse; upcoming: IncomeEntry[]; nameOf: (s: string) => string; fmt: Fmt }) {
  const { t } = useTranslation('holdings');
  return (
    <div className="min-w-0 space-y-5">
      {data.year
        ? <YearView year={data.year} upcoming={upcoming} today={data.today} nameOf={nameOf} fmt={fmt} />
        : <FreeList data={data} fmt={fmt} />}

      {(data.missing.length > 0 || data.excluded.length > 0 || (data.year?.unknownShares.length ?? 0) > 0) && (
        <div className="space-y-1 text-xs text-muted-foreground">
          {data.year && data.year.unknownShares.length > 0 && <p>{t('dividendHubUnknownShares', { list: data.year.unknownShares.join(', ') })}</p>}
          {data.excluded.length > 0 && <p>{t('dividendHubExcluded', { list: data.excluded.join(', ') })}</p>}
          {data.missing.length > 0 && <p>{t('dividendHubMissing', { list: data.missing.join(', ') })}</p>}
        </div>
      )}

      <Accordion type="single" collapsible className="border-t border-border/60">
        <AccordionItem value="how" className="border-b-0">
          <AccordionTrigger className="text-sm hover:no-underline">{t('dividendHubHowTitle')}</AccordionTrigger>
          <AccordionContent className="space-y-2 text-xs text-muted-foreground">
            <p>{t('dividendHubExplainer')}</p>
            {data.year?.hasProjected && <p>{t('dividendHubYearNoteProjected')}</p>}
            <p>{t('dividendHubUsdNote')}</p>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
}

function FreeList({ data, fmt }: { data: HubResponse; fmt: Fmt }) {
  const { t } = useTranslation('holdings');
  return (
    <>
      <ul className="divide-y divide-border/60">
        {data.holdings.map((h) => {
          const entry = h.next ? nextEntry(h, h.next) : null;
          return (
            <Row
              key={h.symbol}
              symbol={h.symbol}
              name={h.name}
              detail={entry
                ? rowDetail(entry, data.today, t, fmt)
                : h.last ? t('dividendHubLastPaid', { amount: fmt.money(h.last.amount), date: fmt.day(h.last.payDate ?? h.last.exDate) }) : ''}
              amount={entry ? <Amount entry={entry} fmt={fmt} /> : <span className="text-xs text-muted-foreground">{t('dividendHubNotAnnouncedShort')}</span>}
            />
          );
        })}
      </ul>
      {data.yearPaymentCount > 0 && (
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
  );
}

function YearView({ year, upcoming, today, nameOf, fmt }: {
  year: NonNullable<HubResponse['year']>; upcoming: IncomeEntry[]; today: string; nameOf: (s: string) => string; fmt: Fmt;
}) {
  const { t } = useTranslation('holdings');
  const sums = year.months.map((m) => ({
    month: m.month,
    announced: m.entries.filter((e) => e.kind === 'announced').reduce((s, e) => s + (e.total ?? 0), 0),
    projected: m.entries.filter((e) => e.kind === 'projected').reduce((s, e) => s + (e.total ?? 0), 0),
  }));
  const max = Math.max(...sums.map((s) => s.announced + s.projected), 0);
  const total = upcoming.reduce((s, e) => s + (e.total ?? 0), 0);
  const confirmed = upcoming.filter((e) => e.kind === 'announced').reduce((s, e) => s + (e.total ?? 0), 0);

  return (
    <section aria-labelledby="dividend-year-heading" className="space-y-4">
      <div>
        <h3 id="dividend-year-heading" className="text-sm text-muted-foreground">{t('dividendHubNext12')}</h3>
        <p className="mt-1 font-mono text-2xl font-semibold tabular-nums">
          {year.hasProjected ? t('dividendHubAbout', { amount: fmt.rounded(total) }) : fmt.money(total)}
        </p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {!year.hasProjected
            ? t('dividendHubYearNoteAnnounced')
            : confirmed > 0
              ? t('dividendHubConfirmedNote', { amount: fmt.money(confirmed) })
              : t('dividendHubAllEstimated')}
        </p>
      </div>

      {max > 0 && (
        <div>
          {/* Visual only; every month below carries the same numbers for screen readers. */}
          <div className="grid grid-cols-12 items-end gap-1 sm:gap-2" aria-hidden>
            {sums.map((s, i) => (
              <div key={s.month} className="flex flex-col items-center gap-1">
                <div className="flex h-16 w-full flex-col justify-end">
                  {s.projected > 0 && (
                    <div className="w-full rounded-t-sm border border-dashed border-foreground/40 bg-foreground/10" style={{ height: `${(s.projected / max) * 100}%` }} />
                  )}
                  {s.announced > 0 && (
                    <div className={`w-full bg-emerald-600 dark:bg-emerald-400 ${s.projected > 0 ? '' : 'rounded-t-sm'}`} style={{ height: `${(s.announced / max) * 100}%` }} />
                  )}
                </div>
                <span className={`text-xs text-muted-foreground ${i % 2 ? 'invisible sm:visible' : ''}`}>{fmt.month(s.month)}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground" aria-hidden>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-600 dark:bg-emerald-400" />{t('dividendHubConfirmed')}</span>
            {year.hasProjected && (
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-dashed border-foreground/40 bg-foreground/10" />{t('dividendHubEstimated')}</span>
            )}
          </div>
        </div>
      )}

      <ul className="space-y-4">
        {year.months.filter((m) => m.entries.length > 0).map((m) => (
          <li key={m.month}>
            <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 text-sm">
              <span className="font-semibold">{fmt.monthLong(m.month)}</span>
              <span className="font-mono tabular-nums text-muted-foreground">
                {m.entries.some((e) => e.kind === 'projected') ? t('dividendHubAbout', { amount: fmt.rounded(m.total) }) : fmt.money(m.total)}
              </span>
            </div>
            <ul className="mt-1">
              {m.entries.map((e) => (
                <Row key={`${e.symbol}-${e.exDate}`} symbol={e.symbol} name={nameOf(e.symbol)} detail={rowDetail(e, today, t, fmt)} amount={<Amount entry={e} fmt={fmt} />} />
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
