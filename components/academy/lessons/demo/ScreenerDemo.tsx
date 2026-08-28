'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import {
  ScreenerFilters,
  EMPTY_FILTERS,
  type ScreenerFilterValues,
} from '@/components/screener/ScreenerFilters';
import { ScreenerResults } from '@/components/screener/ScreenerResults';
import type { ScreenerRow } from '@/app/api/screener/route';
import { DemoSurfaceShell } from './DemoSurfaceShell';

interface Props {
  /** Called once the learner applies a valuation filter (P/E or P/B). */
  onFilterApplied: () => void;
  onClose: () => void;
  /** The DemoTour overlay, rendered above the surface. */
  children: ReactNode;
}

// Server-side filter keys (rvolMin is client-only/live and irrelevant to the demo).
const SERVER_KEYS: (keyof ScreenerFilterValues)[] = [
  'sector', 'industry', 'marketCapMin', 'marketCapMax', 'peMin', 'peMax',
  'pbMin', 'pbMax', 'betaMin', 'betaMax', 'divYieldMin', 'divYieldMax',
  'profitMarginMin', 'profitMarginMax', 'revenueGrowthMin', 'revenueGrowthMax',
  'week52ChangeMin', 'week52ChangeMax',
];
const BILLION_KEYS = new Set<keyof ScreenerFilterValues>(['marketCapMin', 'marketCapMax']);
// Filters that count as a "valuation" filter for the tour's action gate.
const VALUATION_KEYS: (keyof ScreenerFilterValues)[] = ['peMin', 'peMax', 'pbMin', 'pbMax'];

function buildQuery(filters: ScreenerFilterValues): string {
  const params = new URLSearchParams({ scope: 'sp500' });
  for (const key of SERVER_KEYS) {
    const val = filters[key];
    if (!val) continue;
    if (BILLION_KEYS.has(key)) {
      const n = parseFloat(val);
      if (isFinite(n)) params.set(key, String(n * 1e9));
    } else {
      params.set(key, val);
    }
  }
  return params.toString();
}

interface ScreenerResponse {
  success: boolean;
  results: ScreenerRow[];
  sectors: string[];
  industries: string[];
  total: number;
}

/**
 * Screener demo: mounts the REAL screener presentational stack (the same
 * ScreenerFilters + ScreenerResults the tool page uses) against the S&P 500,
 * read-only. It deliberately does NOT reuse the full screener page component —
 * that is entangled with the user's holdings/watchlist/saved views/URL sync.
 * Recomposing the two pure children keeps the UI faithful but touches no user
 * data. Row links are neutralised so a stray click can't navigate out of the
 * lesson. The tour gate fires once the learner applies a valuation filter.
 */
export function ScreenerDemo({ onFilterApplied, onClose, children }: Props) {
  const { t } = useTranslation('academy');
  const [filters, setFilters] = useState<ScreenerFilterValues>(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  const qs = useMemo(() => buildQuery(filters), [filters]);

  const { data, isLoading } = useQuery<ScreenerResponse>({
    queryKey: ['academy-screener-demo', qs],
    queryFn: async () => {
      const res = await fetch(`/api/screener?${qs}`);
      if (!res.ok) throw new Error('Failed to load screener');
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: keepPreviousData,
  });

  // Fire the tour's action gate the first time a valuation filter is set.
  const hasValuationFilter = VALUATION_KEYS.some((k) => !!filters[k]);
  useEffect(() => {
    if (hasValuationFilter) onFilterApplied();
  }, [hasValuationFilter, onFilterApplied]);

  const results = data?.results ?? [];
  const sectors = data?.sectors ?? [];
  const industries = data?.industries ?? [];

  return (
    <DemoSurfaceShell eyebrow={t('screenerDemoEyebrow')} title={t('screenerDemoTitle')} onClose={onClose}>
      <p className="mb-5 text-sm text-muted-foreground">
        {t('screenerDemoDescription', { count: data?.total ?? 500 })}
      </p>

      <div className="flex flex-col gap-4 md:flex-row">
        {/* Filters */}
        <div data-tour="screener-filters" className="w-full shrink-0 md:w-56">
          <div className="rounded-xl border border-border/60 bg-card/40 p-4">
            <ScreenerFilters
              filters={filters}
              sectors={sectors}
              industries={industries}
              onChange={(next) => { setFilters(next); setPage(1); }}
              onReset={() => { setFilters(EMPTY_FILTERS); setPage(1); }}
            />
          </div>
        </div>

        {/* Results — onClickCapture neutralises row-link navigation so the learner
            can't accidentally leave the lesson; buttons (sort, paging) still work. */}
        <div
          data-tour="screener-results"
          className="min-w-0 flex-1"
          onClickCapture={(e) => {
            if ((e.target as HTMLElement).closest('a')) e.preventDefault();
          }}
        >
          {isLoading && results.length === 0 ? (
            <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              {t('screenerDemoLoading')}
            </div>
          ) : (
            <ScreenerResults
              data={results}
              page={page}
              pageSize={pageSize}
              onPageChange={setPage}
              onPageSizeChange={(sz) => { setPageSize(sz); setPage(1); }}
            />
          )}
        </div>
      </div>

      {children}
    </DemoSurfaceShell>
  );
}
