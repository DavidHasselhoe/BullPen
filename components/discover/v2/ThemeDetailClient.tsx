'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, AlertCircle } from 'lucide-react';
import { ScreenerResults } from '@/components/screener/ScreenerResults';
import { getScreenerColumns } from '@/components/screener/screener-columns';
import { humanizeError } from '@/lib/errors/humanize';
import { THEME_BY_SLUG } from '@/lib/discover/theme-config';
import type { ScreenerRow } from '@/app/api/screener/route';

/** Curated v1 column subset — sector/company info is already a fixed leading
 * column in ScreenerResults. No 7D/1Y return or analyst target here: neither
 * exists anywhere in BullPen's data yet (see plan's Deferred section). */
const THEME_COLUMN_KEYS = ['health_score', 'price', 'market_cap', 'pe_ratio', 'forward_pe', 'revenue_growth_yoy', 'dividend_yield'];

export function ThemeDetailClient({ slug }: { slug: string }) {
  const { t } = useTranslation('discover');
  // Screener column labels (screener-columns.tsx) live in 'tools', same
  // namespace app/tools/screener/page.tsx uses — not 'discover'.
  const { t: tTools } = useTranslation('tools');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Static config, safe to look up client-side — the server page already
  // called notFound() for any slug not in THEME_BY_SLUG before rendering us.
  // Looked up (not destructured as a prop) so every hook below still runs
  // unconditionally regardless of this lookup's result.
  const theme = THEME_BY_SLUG.get(slug);
  const symbolsParam = theme?.tickers.join(',') ?? '';

  const { data, isLoading, error } = useQuery<{ success: boolean; results?: ScreenerRow[] }>({
    queryKey: ['screener-symbols', symbolsParam],
    queryFn: async () => {
      const res = await fetch(`/api/screener?symbols=${encodeURIComponent(symbolsParam)}`);
      if (!res.ok) throw new Error(`Screener failed: ${res.status}`);
      return res.json();
    },
    enabled: symbolsParam.length > 0,
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const visibleColumns = useMemo(
    () => getScreenerColumns(tTools).filter((c) => THEME_COLUMN_KEYS.includes(c.key)),
    [tTools],
  );

  // Basket-level averages from the same rows already fetched for the table —
  // no extra request. Health/P·E average only over rows that have a value
  // (nulls excluded); dividend yield zero-fills non-payers so it reads as the
  // basket's blended yield, not just an average across payers.
  const stats = useMemo(() => {
    const rows = data?.results ?? [];
    if (rows.length === 0) return null;
    const avg = (vals: number[]) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null);
    const healthScores = rows.map((r) => r.health_score).filter((v): v is number => v != null);
    const peRatios = rows.map((r) => r.pe_ratio).filter((v): v is number => v != null && v > 0);
    return {
      count: rows.length,
      avgHealth: avg(healthScores),
      avgPe: avg(peRatios),
      avgYieldPct: avg(rows.map((r) => (r.dividend_yield ?? 0) * 100)),
    };
  }, [data?.results]);

  if (!theme) return null;

  const Icon = theme.icon;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <Link
        href="/discover"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground/80 hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {t('ideasThemeBackToDiscover')}
      </Link>

      <div className="mb-8 flex items-start gap-3">
        <Icon className="mt-0.5 h-7 w-7 shrink-0 text-primary" aria-hidden />
        <div>
          <h1 className="text-2xl font-bold text-foreground">{theme.title}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground/90">{theme.description}</p>
          {stats && (
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground/80">
              <span>{t('ideasThemeCompaniesCount', { count: stats.count })}</span>
              {stats.avgHealth != null && (
                <span>· {t('ideasThemeAvgHealth', { score: Math.round(stats.avgHealth) })}</span>
              )}
              {stats.avgPe != null && <span>· {t('ideasThemeAvgPe', { pe: stats.avgPe.toFixed(1) })}</span>}
              {stats.avgYieldPct != null && (
                <span>· {t('ideasThemeAvgYield', { pct: stats.avgYieldPct.toFixed(2) })}</span>
              )}
            </p>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="h-[400px] animate-shimmer rounded-xl border border-border/20" />
      ) : error || !data?.results ? (
        <div className="flex items-start gap-3 rounded-xl border border-red-500/30 bg-red-500/5 p-6">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-400" aria-hidden />
          <p className="text-sm text-muted-foreground">{humanizeError(error)}</p>
        </div>
      ) : (
        <ScreenerResults
          data={data.results}
          visibleColumns={visibleColumns}
          page={page}
          pageSize={pageSize}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      )}
    </div>
  );
}
