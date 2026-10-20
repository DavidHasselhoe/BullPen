'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowLeft } from 'lucide-react';
import { ScreenerResults } from '@/components/screener/ScreenerResults';
import { getScreenerColumns, type ScreenerColumn } from '@/components/screener/screener-columns';
import { cn } from '@/lib/utils';
import type { ScreenerRow } from '@/app/api/screener/route';
import type { IndexId } from '@/lib/market-data/index-membership';

const INDEX_ORDER: IndexId[] = ['sp500', 'nasdaq100', 'dow30'];
// No price columns: a fresh price for every member is ~500 TwelveData credits a
// view (the last-price cache lives 3 minutes), most of the per-minute budget on
// a public page. Everything here comes from screener_stats; a click opens the
// stock with its price.
const COLUMN_KEYS = ['market_cap', 'health_score', 'pe_ratio', 'revenue_growth_yoy', 'dividend_yield'];

/** Date-only values: pinned to UTC so no zone moves them a day. */
function fmtDay(ymd: string, lang: string): string {
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString(lang, { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export interface IndexPageEvent {
  ticker: string;
  change: 'added' | 'removed';
  /** Monday of the week it happened (indexChangeWeekOf), never an exact day. */
  weekOf: string;
}

interface Props {
  id: IndexId;
  /** From the server, so every company is in the first HTML. */
  rows: ScreenerRow[];
  /** Fund weights (SPY / DIA), null for the Nasdaq-100 or when none are recent. */
  weights: { asOf: string; pct: Record<string, number> } | null;
  events: IndexPageEvent[];
}

export function IndexDetailClient({ id, rows, weights, events }: Props) {
  const { t, i18n } = useTranslation('discover');
  // Screener column labels live in 'tools' (same as ThemeDetailClient).
  const { t: tTools } = useTranslation('tools');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  const day = (ymd: string) => fmtDay(ymd, i18n.language);
  const pctFmt = useMemo(() => new Intl.NumberFormat(i18n.language, { style: 'percent', maximumSignificantDigits: 2 }), [i18n.language]);
  // Fixed decimals in the column so the figures line up.
  const weightFmt = useMemo(() => new Intl.NumberFormat(i18n.language, { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 }), [i18n.language]);

  const columns = useMemo(() => {
    const base = getScreenerColumns(tTools).filter((c) => COLUMN_KEYS.includes(c.key));
    if (!weights) return base;
    const weight: ScreenerColumn = {
      key: 'index_weight',
      label: t('indexColWeightLabel'),
      tip: t(`indexColWeightTip_${id}`, { date: fmtDay(weights.asOf, i18n.language) }),
      group: 'valuation',
      defaultVisible: true,
      width: 76,
      getValue: (row) => weights.pct[row.ticker] ?? null,
      render: (row) => {
        const v = weights.pct[row.ticker];
        return v == null ? '—' : weightFmt.format(v / 100);
      },
    };
    return [weight, ...base];
  }, [tTools, t, id, weights, weightFmt, i18n.language]);

  const topTenPct = useMemo(() => {
    if (!weights) return null;
    return Object.values(weights.pct).sort((a, b) => b - a).slice(0, 10).reduce((a, b) => a + b, 0);
  }, [weights]);

  const names = useMemo(() => new Map(rows.map((r) => [r.ticker, r.name])), [rows]);
  const indexName = t(`indexName_${id}`);

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <Link
        href="/discover"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('ideasThemeBackToDiscover')}
      </Link>

      <nav aria-label={t('indexPageNavLabel')} className="mb-5 flex flex-wrap gap-2">
        {INDEX_ORDER.map((other) => (
          <Link
            key={other}
            href={`/discover/indexes/${other}`}
            aria-current={other === id ? 'page' : undefined}
            className={cn(
              'inline-flex min-h-9 items-center rounded-full border px-3.5 text-sm font-medium transition-colors',
              other === id
                ? 'border-foreground/30 bg-foreground/5 text-foreground'
                : 'border-border/60 text-muted-foreground hover:border-border hover:text-foreground',
            )}
          >
            {t(`indexName_${other}`)}
          </Link>
        ))}
      </nav>

      <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('indexPageTitle', { index: indexName })}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">{t(`indexPageIntro_${id}`)}</p>
      <p className="mt-3 flex flex-wrap gap-x-2 gap-y-1 text-sm text-muted-foreground">
        <span>{t('ideasThemeCompaniesCount', { count: rows.length })}</span>
        {topTenPct != null && weights && (
          <>
            {/* On a phone the two wrap onto their own lines, where a leading dot reads as a stray bullet. */}
            <span aria-hidden className="hidden sm:inline">·</span>
            <span>{t('indexPageTopTen', { pct: pctFmt.format(topTenPct / 100), date: day(weights.asOf) })}</span>
          </>
        )}
      </p>

      {events.length > 0 && (
        <section aria-labelledby="index-changes-heading" className="mt-6 rounded-xl border border-border/60 px-4 py-3">
          <h2 id="index-changes-heading" className="text-sm font-semibold text-foreground">
            {t('indexPageChangesHeading')}
          </h2>
          <ul className="mt-2 space-y-1.5">
            {events.map((e) => (
              <li key={`${e.ticker}-${e.change}-${e.weekOf}`} className="text-sm text-muted-foreground">
                <Link href={`/stock/${e.ticker}`} className="font-mono font-medium text-foreground hover:underline">
                  {e.ticker}
                </Link>
                {names.get(e.ticker) && names.get(e.ticker) !== e.ticker && <span> {names.get(e.ticker)}</span>}{' '}
                {t(e.change === 'added' ? 'indexPageJoined' : 'indexPageLeft', { date: day(e.weekOf) })}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-6">
        <ScreenerResults
          data={rows}
          visibleColumns={columns}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>
    </div>
  );
}
