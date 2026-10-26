'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, GraduationCap } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { RangeBar } from '@/components/viz/RangeBar';
import { useAuth } from '@/components/auth/AuthProvider';
import { useHoldings } from '@/hooks/use-holdings';
import { useLivePrices } from '@/hooks/use-live-prices';
import { useStockQuote } from '@/hooks/use-stock-price';
import { useExchangeRates } from '@/hooks/use-exchange-rates';
import { convertCurrency, formatCurrency, type CurrencyCode } from '@/lib/currency/currency-conversion';
import { COMMODITIES, slugToAssetPath, symbolToSlug, type Commodity } from '@/lib/assets/asset-type';
import { BIG_FOUR_LESSON, type EconomicKind } from '@/lib/market-data/economic-kinds';
import { addDays, todayET } from '@/lib/dates/calendar-format';
import { fmtTradingDate, intlLocale } from '@/lib/dates/clock';
import { cn } from '@/lib/utils';
import type { CommodityData } from '@/app/api/asset/[slug]/commodity/route';

// ─── Shared helpers ──────────────────────────────────────────────────────────

const usd = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Under half a hundredth of a percent is no move: grey, never red. */
const isFlat = (pct: number) => Math.abs(pct) < 0.005;
const fmtPct = (pct: number, digits = 2) => (isFlat(pct) ? '0.00%' : `${pct > 0 ? '+' : ''}${pct.toFixed(digits)}%`);
const tone = (pct: number) => (isFlat(pct) ? 'text-muted-foreground' : pct > 0 ? 'text-emerald-400' : 'text-red-400');

/** Driver copy is shared within a family: silver adds industry to gold's, platinum and palladium share theirs. */
const DRIVERS: Record<Commodity['id'], { set: string; count: number }> = {
  xau: { set: 'gold', count: 4 },
  xag: { set: 'silver', count: 3 },
  xpt: { set: 'pgm', count: 3 },
  xpd: { set: 'pgm', count: 3 },
  wti: { set: 'oil', count: 4 },
  xbr: { set: 'oil', count: 4 },
};

/** Releases that move each family. All come from the economic calendar except the weekly EIA report. */
const EVENT_KINDS: Record<Commodity['group'], EconomicKind[]> = {
  metal: ['fomc', 'cpi', 'pce', 'jobs'],
  oil: ['fomc', 'cpi', 'jobs'],
};

function useCommodityData(slug: string) {
  return useQuery<CommodityData | null>({
    queryKey: ['commodity-insights', slug],
    queryFn: async () => {
      const res = await fetch(`/api/asset/${encodeURIComponent(slug)}/commodity`);
      const json = await res.json();
      return json.success ? (json.data as CommodityData) : null;
    },
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
}

/** The price the panel above shows: live tick first, then the REST quote it shares a cache with. */
function useSpotPrice(slug: string): number | null {
  const live = useLivePrices([slug]).get(slug)?.price;
  const { data: quote } = useStockQuote(slug);
  const price = live ?? quote?.c;
  return price && price > 0 ? price : null;
}

// ─── Market status ───────────────────────────────────────────────────────────

/**
 * CME hours for metals and energy, in New York time: Sunday 18:00 to Friday
 * 17:00, with a 17:00-18:00 break Monday to Thursday. Exchange holidays are
 * not modelled; on those days the chip can say open while trading is thin.
 */
export function commodityMarketStatus(now = new Date()): 'open' | 'break' | 'weekend' {
  const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  const mins = et.getHours() * 60 + et.getMinutes();
  if (day === 6 || (day === 0 && mins < 18 * 60) || (day === 5 && mins >= 17 * 60)) return 'weekend';
  if (day !== 0 && mins >= 17 * 60 && mins < 18 * 60) return 'break';
  return 'open';
}

export function CommodityStatusChip() {
  const { t } = useTranslation('stock');
  const status = commodityMarketStatus();
  const label =
    status === 'open' ? t('commodityStatusOpen') : status === 'break' ? t('commodityStatusBreak') : t('commodityStatusWeekend');
  return (
    <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground" title={t('commodityStatusHint')}>
      <span
        aria-hidden
        className={cn('h-1.5 w-1.5 rounded-full', status === 'open' ? 'bg-emerald-400' : 'bg-muted-foreground/60')}
      />
      {label}
    </span>
  );
}

// ─── Ways to own it ──────────────────────────────────────────────────────────

export function CommodityOwnCard({ commodity, slug }: { commodity: Commodity; slug: string }) {
  const { t } = useTranslation('stock');
  const { data, isLoading } = useCommodityData(slug);
  const { data: holdings } = useHoldings();
  const { data: spotQuote } = useStockQuote(slug);
  const owned = new Set((holdings ?? []).map((h) => h.symbol.toUpperCase()));
  const name = t(`commodityName_${commodity.id}`);
  const noun = t(`commodityNoun_${commodity.id}`);
  const quotes = new Map((data?.own ?? []).map((q) => [q.ticker, q]));
  const kindLabel = (kind: string) =>
    kind === 'producer' ? t(`commodityOwnKind_producer_${commodity.group}`) : t(`commodityOwnKind_${kind}`);

  return (
    <Card className="mb-8">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{t('commodityOwnTitle', { name: noun })}</CardTitle>
        <p className="text-sm text-muted-foreground">{t(`commodityOwnIntro_${commodity.group}`, { name: noun })}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <ul className="divide-y divide-border/60">
          {/* Spot first, as the line every row is read against. */}
          <li className="flex items-center gap-3 py-3">
            <CompanyLogo name={name} ticker={commodity.ticker} size={36} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{t('commodityOwnSpot', { name })}</p>
              <p className="font-mono text-xs text-muted-foreground">{commodity.ticker}</p>
            </div>
            {spotQuote && spotQuote.c > 0 && (
              <span className="text-right">
                <span className="block font-mono text-sm tabular-nums text-foreground">{usd(spotQuote.c)}</span>
                <span className={cn('block font-mono text-xs tabular-nums', tone(spotQuote.dp))}>{fmtPct(spotQuote.dp)}</span>
              </span>
            )}
          </li>
          {commodity.own.map((o) => {
            const q = quotes.get(o.ticker);
            const isEtf = o.kind !== 'producer';
            return (
              <li key={o.ticker}>
                <Link
                  href={slugToAssetPath(o.ticker, isEtf ? 'ETF' : 'Common Stock')}
                  className="-mx-2 flex items-center gap-3 rounded-md px-2 py-3 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                >
                  <CompanyLogo name={o.name} ticker={o.ticker} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-medium text-foreground">
                      <span className="font-mono">{o.ticker}</span>
                      {/* clamp-ok: fund names are short proper nouns */}
                      <span className="truncate font-normal text-muted-foreground" title={o.name}>{o.name}</span>
                      {owned.has(o.ticker) && <Badge variant="secondary" className="text-[11px]">{t('commodityOwnYours')}</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">{kindLabel(o.kind)}</p>
                  </div>
                  {q ? (
                    <span className="text-right">
                      <span className="block font-mono text-sm tabular-nums text-foreground">{usd(q.price)}</span>
                      <span className={cn('block font-mono text-xs tabular-nums', tone(q.changePct))}>{fmtPct(q.changePct)}</span>
                    </span>
                  ) : isLoading ? (
                    <Skeleton className="h-9 w-16" />
                  ) : null}
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{t(`commodityOwnNote_${commodity.group}`)}</p>
      </CardContent>
    </Card>
  );
}

// ─── In context ──────────────────────────────────────────────────────────────

export function CommodityContextCard({ commodity, slug }: { commodity: Commodity; slug: string }) {
  const { t, i18n } = useTranslation('stock');
  const { user } = useAuth();
  const { data, isLoading } = useCommodityData(slug);
  const price = useSpotPrice(slug);
  const name = t(`commodityName_${commodity.id}`);
  const locale = intlLocale(i18n.language);

  const pref = (user?.settings as Record<string, unknown> | undefined)?.default_currency as string | undefined;
  const currency: CurrencyCode = !pref || pref === 'exchange' ? 'USD' : (pref as CurrencyCode);
  const { data: rates } = useExchangeRates('USD', currency !== 'USD');
  // Until rates arrive (or for a USD user) amounts stay in dollars rather than show a wrong conversion.
  const fx: CurrencyCode = currency !== 'USD' && rates ? currency : 'USD';
  const local = (n: number) => formatCurrency(fx === 'USD' ? n : convertCurrency(n, 'USD', fx, rates ?? null), fx, locale);

  const h = data?.history;
  const peers = (data?.peers ?? [])
    .map((p) => ({ quote: p, meta: COMMODITIES.find((c) => c.ticker === p.ticker) }))
    .filter((p): p is { quote: (typeof p)['quote']; meta: Commodity } => !!p.meta);

  if (isLoading && !data) {
    return (
      <Card className="mb-8">
        <CardHeader className="pb-2"><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent><Skeleton className="h-40 w-full" /></CardContent>
      </Card>
    );
  }
  if (!data) return null;

  // Both ends: gold 2% off its low is also 28% off its high, and that is the story.
  const rangeInsight = h && price
    ? t('commodityRangePosition', {
        below: Math.max(0, ((h.high52 - price) / h.high52) * 100).toFixed(0),
        above: Math.max(0, ((price - h.low52) / h.low52) * 100).toFixed(0),
      })
    : null;
  const returns = (h?.returns ?? []).filter((r) => r.asset != null);
  const showRatio = data.ratio != null && (commodity.id === 'xau' || commodity.id === 'xag');

  return (
    <Card className="mb-8">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{t('commodityContextTitle', { name })}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid gap-x-10 gap-y-6 md:grid-cols-2">
          <div className="space-y-6">
            {h && (
              <section>
                <h3 className="text-xs font-medium text-muted-foreground">{t('commodityYearRange')}</h3>
                {rangeInsight && <p className="mt-1 text-sm font-medium text-foreground">{rangeInsight}</p>}
                <RangeBar
                  className="mt-3"
                  hideCurrentLabel
                  low={h.low52}
                  high={h.high52}
                  current={price}
                  format={usd}
                  srLabel={`${t('commodityYearRange')}: ${usd(h.low52)} to ${usd(h.high52)}${price ? `, ${usd(price)}` : ''}`}
                />
              </section>
            )}
            {price && (
              <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
                {(commodity.unit.per === 'gram'
                  ? [[t('commodityPerGram'), price / commodity.unit.size], [t('commodityPerKilo'), (price / commodity.unit.size) * 1000]] as const
                  : [[t('commodityPerLitre'), price / commodity.unit.size]] as const
                ).map(([label, value]) => (
                  <div key={label} className="contents">
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="text-right font-mono tabular-nums text-foreground">{local(value)}</dd>
                  </div>
                ))}
              </dl>
            )}
            {showRatio && (
              <section>
                <h3 className="text-xs font-medium text-muted-foreground">{t('commodityRatioLabel')}</h3>
                <p className="mt-1 font-mono text-sm tabular-nums text-foreground">{data.ratio!.toFixed(1)}</p>
                {h?.ratioAvg10y != null && (
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    {t('commodityRatioInsight', { ratio: data.ratio!.toFixed(0), avg: h.ratioAvg10y.toFixed(0) })}
                  </p>
                )}
              </section>
            )}
            {commodity.group === 'oil' && data.spread != null && (
              <section>
                <h3 className="text-xs font-medium text-muted-foreground">{t('commoditySpreadLabel')}</h3>
                <p className="mt-1 text-sm leading-relaxed text-foreground">
                  {data.spread >= 0
                    ? t('commoditySpreadAbove', { amount: usd(data.spread) })
                    : t('commoditySpreadBelow', { amount: usd(-data.spread) })}
                </p>
              </section>
            )}
          </div>

          {returns.length > 0 && (
            <section>
              <h3 className="text-xs font-medium text-muted-foreground">{t('commodityReturnsTitle')}</h3>
              <table className="mt-2 w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground">
                    <th className="py-1.5 text-left font-normal"><span className="sr-only">{t('commodityReturnsTitle')}</span></th>
                    <th className="py-1.5 text-right font-medium text-foreground">{name}</th>
                    <th className="py-1.5 text-right font-normal">{t('commodityReturnsSp500')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {returns.map((r) => (
                    <tr key={r.years}>
                      <td className="py-2 text-muted-foreground">{t('commodityReturnsPeriod', { count: r.years })}</td>
                      <td className={cn('py-2 text-right font-mono tabular-nums', tone(r.asset!))}>{fmtPct(r.asset!, 0)}</td>
                      <td className={cn('py-2 text-right font-mono tabular-nums', r.sp500 == null ? 'text-muted-foreground' : tone(r.sp500))}>
                        {r.sp500 == null ? '' : fmtPct(r.sp500, 0)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-2 text-xs text-muted-foreground">{t('commodityReturnsNote')}</p>
            </section>
          )}
        </div>

        {peers.length > 0 && (
          <div className="mt-6 border-t border-border/60 pt-4">
            <h3 className="text-xs font-medium text-muted-foreground">{t(`commodityRelated_${commodity.group}`)}</h3>
            <ul className="mt-2 flex flex-wrap gap-2">
              {peers.map(({ quote, meta }) => (
                <li key={meta.ticker}>
                  <Link
                    href={`/asset/${symbolToSlug(meta.ticker)}`}
                    className="flex min-h-11 items-center gap-2 rounded-md border border-border/60 px-3 py-1.5 text-sm transition-colors hover:border-border hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <CompanyLogo name={meta.name} ticker={meta.ticker} size={22} />
                    <span className="text-foreground">{t(`commodityName_${meta.id}`)}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">{usd(quote.price)}</span>
                    <span className={cn('font-mono text-xs tabular-nums', tone(quote.changePct))}>{fmtPct(quote.changePct)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── About ───────────────────────────────────────────────────────────────────

interface EconomicEventLite { id: string; kind: EconomicKind; date: string }

export function CommodityAboutCard({ commodity }: { commodity: Commodity }) {
  const { t } = useTranslation('stock');
  const { t: tTools } = useTranslation('tools');
  const noun = t(`commodityNoun_${commodity.id}`);
  const drivers = DRIVERS[commodity.id];

  const from = todayET();
  const { data: events } = useQuery<EconomicEventLite[]>({
    queryKey: ['economic-events', from, 'commodity'],
    queryFn: async () => {
      const res = await fetch(`/api/calendar/economic?from=${from}&to=${addDays(from, 45)}`);
      const json = await res.json();
      return json.success ? (json.data as EconomicEventLite[]) : [];
    },
    staleTime: 60 * 60 * 1000,
  });
  const kinds = EVENT_KINDS[commodity.group];
  const upcoming = (events ?? []).filter((e) => kinds.includes(e.kind)).slice(0, 3);
  const fmtDay = (date: string) => fmtTradingDate(new Date(`${date}T12:00:00Z`), { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <Card className="mb-8">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">{t('commodityAboutTitle', { name: noun })}</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="max-w-prose text-sm leading-relaxed text-foreground/90">{t(`commodityAbout_${commodity.id}`)}</p>

        <Accordion type="multiple" className="mt-2">
          <AccordionItem value="drivers">
            <AccordionTrigger>{t('commodityDriversTitle')}</AccordionTrigger>
            <AccordionContent>
              <ul className="max-w-prose list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
                {Array.from({ length: drivers.count }, (_, i) => {
                  // Each driver opens with a short lead ("Interest rates."); set it apart so the list scans.
                  const text = t(`commodityDriver_${drivers.set}_${i + 1}`);
                  const cut = text.indexOf('. ');
                  return (
                    <li key={i}>
                      {cut > 0 && cut < 40 ? (
                        <>
                          <span className="font-medium text-foreground">{text.slice(0, cut + 1)}</span>
                          {text.slice(cut + 1)}
                        </>
                      ) : text}
                    </li>
                  );
                })}
              </ul>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="difference">
            <AccordionTrigger>{t('commodityDiffTitle')}</AccordionTrigger>
            <AccordionContent>
              <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">{t(`commodityDiff_${commodity.group}`)}</p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>

        {(upcoming.length > 0 || commodity.group === 'oil') && (
          <section className="mt-5">
            <h3 className="text-xs font-medium text-muted-foreground">{t('commodityEventsTitle')}</h3>
            <ul className="mt-2 divide-y divide-border/60">
              {commodity.group === 'oil' && (
                <li className="flex items-baseline justify-between gap-4 py-2 text-sm">
                  <span className="text-foreground">{t('commodityEventEia')}</span>
                  <span className="shrink-0 text-muted-foreground">{t('commodityEventEiaWhen')}</span>
                </li>
              )}
              {upcoming.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between gap-4 py-2 text-sm">
                  <span className="text-foreground">{tTools(`economicName_${e.kind}`)}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{fmtDay(e.date)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Link
          href={BIG_FOUR_LESSON}
          className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-foreground underline-offset-4 hover:underline"
        >
          <GraduationCap className="h-4 w-4 text-muted-foreground" aria-hidden />
          {t('commodityLearn')}
          <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        </Link>
      </CardContent>
    </Card>
  );
}
