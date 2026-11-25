'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { ArrowRight, Check, ChevronDown, MessageSquare, Sparkles } from 'lucide-react';
import type { CompareCompany } from '@/lib/compare/fetch-compare-company';
import { buildVerdict } from '@/lib/compare/verdict';
import { pairSlug } from '@/lib/compare/popular-pairs';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import { ClampedText } from '@/components/ui/ClampedText';
import { Button } from '@/components/ui/button';
import { useAIPanel } from '@/components/ai/AIPanelProvider';
import { useRecentlyCompared } from '@/hooks/use-recently-compared';
import { fmtShortDate, fmtMonthLabel, monthKeyOf } from '@/lib/dates/calendar-format';
import { cn } from '@/lib/utils';

/**
 * Compare's results, shared by the interactive tool (/tools/compare?tickers=)
 * and the server-rendered pair pages (/tools/compare/aapl-vs-msft). Leads with
 * the plain verdict, then the companies, then the numbers behind it.
 */

function usd(n: number | null, na: string): string {
  if (n == null) return na;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}$${(abs / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  return `${sign}$${abs.toFixed(2)}`;
}
const pct = (n: number | null, na: string) => (n == null ? na : `${n.toFixed(1)}%`);

/** The period a company's financial figures cover. TTM and fiscal-year figures differ, so the page always says which. */
function basisLabel(c: CompareCompany, t: TFunction): string | null {
  const b = c.metricsBasis;
  if (!b) return null;
  return b.kind === 'ttm'
    ? t('compareBasisTtm', { date: fmtMonthLabel(monthKeyOf(b.through)) })
    : t('compareBasisFy', { year: b.year });
}

function formatFiscalYearEnd(fye: string): string {
  const [month, day] = fye.split('-');
  const m = parseInt(month, 10) - 1;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return m >= 0 && m < 12 && day ? `${months[m]} ${parseInt(day, 10)}` : fye;
}

/** better: which direction is "ahead". 'none' rows (assets, equity, EPS, market value) are facts, not a contest. */
type Row = {
  key: string;
  label: string;
  get: (c: CompareCompany) => number | null;
  format: (n: number | null) => string;
  better: 'higher' | 'lower' | 'none';
  /** Percent-point gap ("+18.9 pts") rather than a dollar gap. */
  isPct?: boolean;
};

function getGroups(t: TFunction, na: string): Array<{ name: string; rows: Row[] }> {
  const m = (k: keyof CompareCompany['metrics']) => (c: CompareCompany) => c.metrics[k];
  return [
    {
      name: t('compareGroupToday'),
      rows: [
        { key: 'healthScore', label: t('compareMetricHealthScoreLabel'), get: (c) => c.market?.healthScore ?? null, format: (n) => (n == null ? na : `${Math.round(n)}/100`), better: 'higher' },
        { key: 'marketCap', label: t('compareMetricMarketCapLabel'), get: (c) => c.market?.marketCap ?? null, format: (n) => usd(n, na), better: 'none' },
        { key: 'peRatio', label: t('compareMetricPeRatioLabel'), get: (c) => (c.market?.peRatio != null && c.market.peRatio > 0 ? c.market.peRatio : null), format: (n) => (n == null ? na : n.toFixed(1)), better: 'lower' },
        { key: 'dividendYield', label: t('compareMetricDividendYieldLabel'), get: (c) => (c.market?.dividendYield != null ? c.market.dividendYield * 100 : null), format: (n) => (n == null ? t('compareVerdictDividendNone') : `${n.toFixed(2)}%`), better: 'higher', isPct: true },
      ],
    },
    {
      name: t('compareGroupProfitability'),
      rows: [
        { key: 'grossMargin', label: t('compareMetricGrossMarginLabel'), get: m('grossMargin'), format: (n) => pct(n, na), better: 'higher', isPct: true },
        { key: 'operatingMargin', label: t('compareMetricOperatingMarginLabel'), get: m('operatingMargin'), format: (n) => pct(n, na), better: 'higher', isPct: true },
        { key: 'netMargin', label: t('compareMetricNetMarginLabel'), get: m('netMargin'), format: (n) => pct(n, na), better: 'higher', isPct: true },
        // Not a contest: EPS depends on how many shares each company has.
        { key: 'epsDiluted', label: t('compareMetricEpsDilutedLabel'), get: m('epsDiluted'), format: (n) => (n == null ? na : `$${n.toFixed(2)}`), better: 'none' },
      ],
    },
    {
      name: t('compareGroupGrowth'),
      rows: [
        { key: 'revenueGrowth', label: t('compareMetricRevenueGrowthLabel'), get: m('revenueGrowth'), format: (n) => (n == null ? na : `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`), better: 'higher', isPct: true },
      ],
    },
    {
      name: t('compareGroupScale'),
      rows: [
        { key: 'revenue', label: t('compareMetricRevenueLabel'), get: m('revenue'), format: (n) => usd(n, na), better: 'higher' },
        { key: 'netIncome', label: t('compareMetricNetIncomeLabel'), get: m('netIncome'), format: (n) => usd(n, na), better: 'higher' },
        { key: 'freeCashFlow', label: t('compareMetricFreeCashFlowLabel'), get: m('freeCashFlow'), format: (n) => usd(n, na), better: 'higher' },
        { key: 'totalAssets', label: t('compareMetricTotalAssetsLabel'), get: m('totalAssets'), format: (n) => usd(n, na), better: 'none' },
        { key: 'shareholdersEquity', label: t('compareMetricShareholdersEquityLabel'), get: m('shareholdersEquity'), format: (n) => usd(n, na), better: 'none' },
      ],
    },
  ];
}

/** Gap between two values, named by who is ahead: "MSFT +18.9 pts". */
function gapText(row: Row, a: CompareCompany, b: CompareCompany, t: TFunction): string | null {
  const va = row.get(a);
  const vb = row.get(b);
  if (va == null || vb == null) return null;
  if (va === vb) return t('compareSameValue');
  const [hi, lo, who] = va > vb ? [va, vb, a] : [vb, va, b];
  const d = hi - lo;
  const diff = row.isPct
    ? `+${d.toFixed(1)} pts`
    : row.key === 'peRatio' || row.key === 'healthScore'
      ? `+${row.key === 'peRatio' ? d.toFixed(1) : Math.round(d)}`
      : row.key === 'epsDiluted'
        ? `+$${d.toFixed(2)}`
        : `+${usd(d, '')}`;
  return t('compareAheadBy', { ticker: who.ticker, diff });
}

function aheadIndex(row: Row, companies: CompareCompany[]): number | null {
  if (row.better === 'none') return null;
  const vals = companies.map((c, i) => ({ v: row.get(c), i })).filter((x): x is { v: number; i: number } => x.v != null);
  if (vals.length < 2) return null;
  vals.sort((x, y) => (row.better === 'higher' ? y.v - x.v : x.v - y.v));
  return vals[0].v === vals[1].v ? null : vals[0].i;
}

function definitionKeys(key: string): [string, string] {
  const cap = key.charAt(0).toUpperCase() + key.slice(1);
  return [`compareMetric${cap}Definition`, `compareMetric${cap}WhyMatters`];
}

export function CompareResults({
  companies,
  related = [],
}: {
  companies: CompareCompany[];
  related?: Array<[string, string]>;
}) {
  const { t } = useTranslation('tools');
  const na = t('compareDataUnavailable');
  const verdict = useMemo(() => buildVerdict(companies, t), [companies, t]);
  const groups = getGroups(t, na);
  const two = companies.length === 2;
  const tickersKey = companies.map((c) => c.ticker).join(',');

  const [openRow, setOpenRow] = useState<string | null>(null);
  const [explain, setExplain] = useState<{ loading: boolean; text: string | null; error: string | null }>({ loading: false, text: null, error: null });

  const { open: openAIPanel, setAIContext } = useAIPanel();
  const { add: addRecentComparison } = useRecentlyCompared();

  // Keyed on the ticker string: `companies` is a fresh array on every render of the tool page.
  useEffect(() => {
    const tickers = tickersKey.split(',');
    setAIContext({ tickers, label: tickers.join(' vs ') });
    return () => setAIContext(null);
  }, [tickersKey, setAIContext]);
  useEffect(() => {
    if (companies.length >= 2) {
      addRecentComparison(companies.map((c) => ({ ticker: c.ticker, name: c.name, logo_url: c.logo_url })));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickersKey]);

  async function runExplain() {
    setExplain({ loading: true, text: null, error: null });
    try {
      const context = JSON.stringify({
        companies: companies.map((c) => ({
          ticker: c.ticker,
          name: c.name,
          metricsPeriod: basisLabel(c, t),
          revenueGrowthFiscalYear: c.growthYear,
          metrics: c.metrics,
          today: c.market,
          historySummary: c.history.slice(0, 4).map((h) => ({ year: h.fiscalYear, revenue: h.revenue, epsDiluted: h.epsDiluted })),
        })),
      });
      const res = await fetch('/api/ai/compare-explain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context }),
      });
      const json = await res.json();
      setExplain(json.success
        ? { loading: false, text: json.explanation, error: null }
        : { loading: false, text: null, error: json.error || t('compareExplainFailed') });
    } catch (e) {
      setExplain({ loading: false, text: null, error: e instanceof Error ? e.message : t('compareExplainFailed') });
    }
  }

  const years = Array.from(new Set(companies.flatMap((c) => c.history.map((h) => h.fiscalYear)))).sort((a, b) => b - a).slice(0, 6);
  const colCount = 1 + companies.length + (two ? 1 : 0);

  return (
    // Bottom padding keeps the last rows clear of the floating Ask Bull button on phones.
    <article className="pb-24 sm:pb-0">
      {/* Header: names first (people know "Apple", not "AAPL"), tickers small beneath. */}
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="flex shrink-0 -space-x-3" aria-hidden>
            {companies.map((c) => (
              <CompanyLogo key={c.ticker} name={c.name} ticker={c.ticker} logoUrl={c.logo_url} size={44} className="rounded-full ring-2 ring-background" />
            ))}
          </span>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-foreground text-balance sm:text-3xl">
              {companies.map((c) => c.name).join(' vs ')}
            </h1>
            <p className="mt-1 font-mono text-xs text-muted-foreground">
              {t('comparePairSubtitle', { tickers: companies.map((c) => c.ticker).join(' vs ') })}
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => openAIPanel()} className="shrink-0 gap-2">
          <MessageSquare className="h-4 w-4" aria-hidden />
          {t('compareAskAiButton')}
        </Button>
      </header>

      {/* The answer. Each row names who is ahead in words, so nothing rests on color or weight alone. */}
      {verdict.length > 0 && (
        <section aria-labelledby="compare-verdict" className="rounded-xl border border-border/60 bg-card">
          <h2 id="compare-verdict" className="px-5 pt-5 text-lg font-semibold text-foreground sm:px-6">
            {t('compareVerdictHeading')}
          </h2>
          <dl className="mt-3 divide-y divide-border/60">
            {verdict.map((row) => (
              <div key={row.key} className="grid gap-x-6 gap-y-2 px-5 py-4 sm:grid-cols-[6rem_minmax(0,1fr)] sm:px-6 lg:grid-cols-[6rem_minmax(0,1fr)_minmax(0,1.1fr)] lg:items-center">
                <dt className="text-xs font-medium text-muted-foreground">{row.label}</dt>
                <dd className="text-sm font-medium text-foreground text-pretty">{row.headline}</dd>
                {/* Same columns on every row, so each company's figures line up down the card. */}
                <dd
                  className="grid gap-x-4 gap-y-3 sm:col-start-2 lg:col-start-3"
                  style={{ gridTemplateColumns: `repeat(${Math.min(row.values.length, 3)}, minmax(0, 1fr))` }}
                >
                  {row.values.map((v) => (
                    <div key={v.ticker} className="min-w-0">
                      {/* clamp-ok: a company name above its figure */}
                      <p className="truncate text-xs text-muted-foreground" title={v.name}>{v.name}</p>
                      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5">
                        <span className={cn('font-mono text-sm tabular-nums', v.leads ? 'font-semibold text-foreground' : 'text-muted-foreground')}>
                          {v.text}
                        </span>
                        {v.unit && <span className="text-xs text-muted-foreground">{v.unit}</span>}
                        {v.leads && (
                          <>
                            <Check className="h-3.5 w-3.5 self-center text-foreground" aria-hidden />
                            <span className="sr-only">{t('compareVerdictAhead')}</span>
                          </>
                        )}
                      </p>
                    </div>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-col gap-3 border-t border-border/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
            <p className="text-xs text-muted-foreground">{t('compareVerdictFootnote')}</p>
            <div className="flex shrink-0 items-center gap-3">
              <span className="hidden text-xs text-muted-foreground md:inline">{t('compareExplainPrompt')}</span>
              <Button size="sm" onClick={runExplain} disabled={explain.loading} className="shrink-0 rounded-full animate-ai-pill-shine">
                <Sparkles className={cn('mr-2 h-4 w-4', explain.loading && 'animate-pulse')} aria-hidden />
                {explain.loading ? t('compareGeneratingButton') : t('compareExplainDifferencesButton')}
              </Button>
            </div>
          </div>
          {explain.error && (
            <p role="alert" className="border-t border-border/60 px-5 py-3 text-sm text-destructive sm:px-6">{explain.error}</p>
          )}
          {explain.text && (
            <p className="whitespace-pre-wrap border-t border-border/60 px-5 py-4 text-sm leading-relaxed text-foreground sm:px-6">
              {explain.text}
            </p>
          )}
        </section>
      )}

      {/* The companies: what each one actually does, then a way into its full page. */}
      <section aria-labelledby="compare-companies" className="mt-12">
        <h2 id="compare-companies" className="mb-4 text-lg font-semibold text-foreground">{t('compareCompaniesHeading')}</h2>
        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))' }}>
          {companies.map((c) => (
            <div key={c.ticker} className="flex flex-col rounded-xl border border-border/60 bg-card p-5">
              <div className="flex items-center gap-3">
                <CompanyLogo name={c.name} ticker={c.ticker} logoUrl={c.logo_url} size={40} />
                <div className="min-w-0">
                  <p className="font-medium text-foreground">{c.name}</p>
                  <p className="font-mono text-xs text-muted-foreground">{c.ticker}</p>
                </div>
              </div>
              {(c.sector || c.industry || c.fiscal_year_end) && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {[c.sector, c.industry].filter(Boolean).join(' · ')}
                  {c.fiscal_year_end && (
                    <span className="block">{t('compareFiscalYearEnds', { date: formatFiscalYearEnd(c.fiscal_year_end) })}</span>
                  )}
                </p>
              )}
              {c.description?.trim() && (
                <ClampedText lines={3} className="mt-3" textClassName="text-sm leading-relaxed text-muted-foreground">
                  {c.description.trim()}
                </ClampedText>
              )}
              {c.fx && (
                <p className="mt-3 text-xs text-muted-foreground">
                  {t('compareConvertedNote', { from: c.fx.from, rate: c.fx.rate.toFixed(2), date: fmtShortDate(c.fx.date) })}
                </p>
              )}
              <Link
                href={`/stock/${c.ticker}`}
                className="group mt-auto inline-flex min-h-11 items-center gap-1.5 pt-3 text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
              >
                {t('compareOpenStockPage', { name: c.name })}
                <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* The numbers behind it. The metric column stays pinned while the companies scroll sideways on a phone. */}
      <section aria-labelledby="compare-numbers" className="mt-12">
        <h2 id="compare-numbers" className="text-lg font-semibold text-foreground">{t('compareNumbersHeading')}</h2>
        <p className="mt-1 mb-4 text-sm text-muted-foreground">{t('compareKeyMetricsPeriodNote')}</p>
        <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-border/60">
                <th scope="col" className="sticky left-0 z-10 bg-card px-2 py-3 text-left font-medium text-muted-foreground sm:px-4">
                  <span className="sr-only">{t('compareMetricColumnHeader')}</span>
                </th>
                {companies.map((c) => (
                  <th key={c.ticker} scope="col" className="min-w-[5.5rem] px-2.5 py-3 text-right align-bottom font-semibold sm:min-w-[6.5rem] sm:px-4">
                    <Link href={`/stock/${c.ticker}`} className="font-mono hover:underline">{c.ticker}</Link>
                    {basisLabel(c, t) && (
                      <span className="block text-xs font-normal text-muted-foreground">{basisLabel(c, t)}</span>
                    )}
                  </th>
                ))}
                {two && (
                  <th scope="col" className="hidden min-w-[8rem] px-4 py-3 text-right align-bottom font-medium text-muted-foreground sm:table-cell">
                    {t('compareDifferenceColumnHeader')}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <Fragment key={g.name}>
                  <tr className="bg-muted/40">
                    <th scope="colgroup" colSpan={colCount} className="sticky left-0 px-4 py-2 text-left text-xs font-semibold text-muted-foreground">
                      {g.name}
                    </th>
                  </tr>
                  {g.rows.map((row) => {
                    const ahead = aheadIndex(row, companies);
                    const [defKey, whyKey] = definitionKeys(row.key);
                    const open = openRow === row.key;
                    const panelId = `compare-def-${row.key}`;
                    return (
                      <Fragment key={row.key}>
                        <tr className="border-b border-border/40">
                          <th scope="row" className="sticky left-0 z-10 bg-card px-1 py-1 text-left font-normal sm:px-2">
                            <button
                              type="button"
                              aria-expanded={open}
                              aria-controls={panelId}
                              onClick={() => setOpenRow(open ? null : row.key)}
                              className="flex min-h-11 w-full min-w-[7rem] items-center gap-1.5 rounded-md px-2 text-left sm:min-w-[9rem] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                              <span>{row.label}</span>
                              <ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform duration-200', open && 'rotate-180')} aria-hidden />
                              <span className="sr-only">{t('compareShowExplanation', { label: row.label })}</span>
                            </button>
                          </th>
                          {companies.map((c, i) => (
                            <td
                              key={c.ticker}
                              className={cn(
                                'px-2.5 py-2 text-right font-mono tabular-nums sm:px-4',
                                ahead === i ? 'font-semibold text-foreground' : 'text-muted-foreground'
                              )}
                            >
                              <span className="inline-flex items-center justify-end gap-1">
                                {ahead === i && (
                                  <>
                                    <Check className="h-3.5 w-3.5" aria-hidden />
                                    <span className="sr-only">{t('compareHigherMarker')}:</span>
                                  </>
                                )}
                                {row.format(row.get(c))}
                              </span>
                            </td>
                          ))}
                          {two && (
                            <td className="hidden whitespace-nowrap px-4 py-2 text-right font-mono tabular-nums text-muted-foreground sm:table-cell">
                              {gapText(row, companies[0], companies[1], t) ?? na}
                            </td>
                          )}
                        </tr>
                        {open && (
                          <tr id={panelId} className="border-b border-border/40 bg-muted/20">
                            <td colSpan={colCount} className="px-4 py-3">
                              <div className="sticky left-4 max-w-[min(65ch,calc(100vw-4rem))] space-y-1.5 text-sm text-muted-foreground">
                                <p>{t(defKey)}</p>
                                <p>
                                  <span className="font-medium text-foreground">{t('compareWhyItMattersLabel')}</span> {t(whyKey)}
                                </p>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Year by year, straight from the annual reports. */}
      {years.length > 0 && (
        <section aria-labelledby="compare-history" className="mt-12">
          <h2 id="compare-history" className="mb-4 text-lg font-semibold text-foreground">{t('compareHistoryHeading')}</h2>
          <div className="overflow-x-auto rounded-xl border border-border/60 bg-card">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-border/60">
                  <th scope="col" className="sticky left-0 z-10 bg-card px-2 py-3 text-left font-medium text-muted-foreground sm:px-4">
                    {t('compareYearColumnHeader')}
                  </th>
                  {companies.flatMap((c) => [
                    <th key={`${c.ticker}-rev`} scope="col" className="px-2 py-3 text-right font-mono text-xs font-semibold sm:min-w-[6.5rem] sm:px-4">
                      {t('compareTickerRevHeader', { ticker: c.ticker })}
                    </th>,
                    <th key={`${c.ticker}-eps`} scope="col" className="px-2 py-3 text-right font-mono text-xs font-semibold sm:min-w-[5.5rem] sm:px-4">
                      {t('compareTickerEpsHeader', { ticker: c.ticker })}
                    </th>,
                  ])}
                </tr>
              </thead>
              <tbody>
                {years.map((year) => (
                  <tr key={year} className="border-b border-border/40 last:border-0">
                    <th scope="row" className="sticky left-0 z-10 bg-card px-2 py-2.5 text-left font-mono font-normal text-muted-foreground sm:px-4">
                      FY{year}
                    </th>
                    {companies.flatMap((c) => {
                      const h = c.history.find((x) => x.fiscalYear === year);
                      return [
                        <td key={`${c.ticker}-rev`} className="px-2 py-2.5 text-right font-mono tabular-nums sm:px-4">{usd(h?.revenue ?? null, na)}</td>,
                        <td key={`${c.ticker}-eps`} className="px-2 py-2.5 text-right font-mono tabular-nums sm:px-4">
                          {h?.epsDiluted != null ? `$${h.epsDiluted.toFixed(2)}` : na}
                        </td>,
                      ];
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Where next: other head-to-heads with either company, and the open-ended tool. */}
      <nav aria-labelledby={related.length > 0 ? 'compare-related' : undefined} className="mt-12">
        {related.length > 0 && (
          <>
            <h2 id="compare-related" className="mb-3 text-lg font-semibold text-foreground">{t('compareRelatedHeading')}</h2>
            <ul className="flex flex-wrap gap-2">
              {related.map(([a, b]) => (
                <li key={`${a}-${b}`}>
                  <Link
                    href={`/tools/compare/${pairSlug(a, b)}`}
                    className="inline-flex min-h-11 items-center rounded-md border border-border/60 bg-card px-3 font-mono text-sm text-foreground transition-colors hover:border-border hover:bg-accent/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {t('comparePairLink', { a, b })}
                  </Link>
                </li>
              ))}
            </ul>
          </>
        )}
        <Link
          href="/tools/compare"
          className="mt-4 inline-flex min-h-11 items-center gap-1.5 rounded text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('compareOtherCompanies')}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </Link>
      </nav>
    </article>
  );
}
