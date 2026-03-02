'use client';

import { useState, useCallback, useMemo, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Filter } from 'lucide-react';
import {
  ScreenerFilters,
  EMPTY_FILTERS,
  type ScreenerFilterValues,
} from '@/components/screener/ScreenerFilters';
import { ScreenerResults } from '@/components/screener/ScreenerResults';
import type { ScreenerRow } from '@/app/api/screener/route';

export const dynamic = 'force-dynamic';

const FILTER_KEYS = Object.keys(EMPTY_FILTERS) as (keyof ScreenerFilterValues)[];

/** Revenue and FCF filters are entered in billions but the API expects raw values */
const BILLION_KEYS = new Set(['revenueMin', 'revenueMax', 'fcfMin', 'fcfMax']);

function filtersFromParams(sp: URLSearchParams): ScreenerFilterValues {
  const f = { ...EMPTY_FILTERS };
  for (const key of FILTER_KEYS) {
    const val = sp.get(key);
    if (val) f[key] = val;
  }
  return f;
}

function buildQueryString(filters: ScreenerFilterValues): string {
  const params = new URLSearchParams();
  for (const key of FILTER_KEYS) {
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

function ScreenerContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<ScreenerFilterValues>(() =>
    filtersFromParams(searchParams),
  );

  const qs = useMemo(() => buildQueryString(filters), [filters]);

  const { data, isLoading } = useQuery<{
    success: boolean;
    results: ScreenerRow[];
    sectors: string[];
    total: number;
  }>({
    queryKey: ['screener', qs],
    queryFn: async () => {
      const url = `/api/screener${qs ? `?${qs}` : ''}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('Failed to fetch screener data');
      return res.json();
    },
    staleTime: 1000 * 60 * 5,
  });

  const handleChange = useCallback(
    (next: ScreenerFilterValues) => {
      setFilters(next);
      // Sync URL without reloading the page
      const params = new URLSearchParams();
      for (const key of FILTER_KEYS) {
        if (next[key]) params.set(key, next[key]);
      }
      const newUrl = params.toString()
        ? `?${params.toString()}`
        : window.location.pathname;
      router.replace(newUrl, { scroll: false });
    },
    [router],
  );

  const handleReset = useCallback(() => {
    handleChange({ ...EMPTY_FILTERS });
  }, [handleChange]);

  const results = data?.results ?? [];
  const sectors = data?.sectors ?? [];
  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="container mx-auto px-4 py-8 max-w-[1400px]">
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <Filter className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-semibold">Stock Screener</h1>
          {!isLoading && (
            <Badge variant="secondary" className="text-xs">
              {data?.total ?? 0} result{(data?.total ?? 0) !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Filter companies by fundamentals from SEC filings.
        </p>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <Card className="w-64 flex-shrink-0 hidden lg:block self-start sticky top-20">
          <CardContent className="p-4">
            {isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="space-y-1.5">
                    <Skeleton className="h-3 w-20" />
                    <div className="flex gap-2">
                      <Skeleton className="h-8 flex-1" />
                      <Skeleton className="h-8 flex-1" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <ScreenerFilters
                filters={filters}
                sectors={sectors}
                onChange={handleChange}
                onReset={handleReset}
              />
            )}
          </CardContent>
        </Card>

        {/* Mobile filters row */}
        <div className="lg:hidden mb-4 w-full">
          <Card>
            <CardContent className="p-4">
              {isLoading ? (
                <Skeleton className="h-8 w-full" />
              ) : (
                <details className="group">
                  <summary className="flex cursor-pointer items-center gap-2 text-sm font-medium">
                    <Filter className="h-4 w-4" />
                    Filters
                    {activeFilterCount > 0 && (
                      <Badge variant="secondary" className="text-xs">
                        {activeFilterCount}
                      </Badge>
                    )}
                  </summary>
                  <div className="mt-4">
                    <ScreenerFilters
                      filters={filters}
                      sectors={sectors}
                      onChange={handleChange}
                      onReset={handleReset}
                    />
                  </div>
                </details>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Results */}
        <div className="flex-1 min-w-0">
          {isLoading ? (
            <Card>
              <CardContent className="p-4">
                <div className="space-y-3">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <Skeleton key={i} className="h-10 w-full" />
                  ))}
                </div>
              </CardContent>
            </Card>
          ) : (
            <ScreenerResults data={results} />
          )}
        </div>
      </div>
    </div>
  );
}

export default function ScreenerPage() {
  return (
    <Suspense
      fallback={
        <div className="container mx-auto px-4 py-8 max-w-[1400px]">
          <Skeleton className="h-8 w-48 mb-6" />
          <div className="flex gap-6">
            <Skeleton className="w-64 h-[600px] hidden lg:block" />
            <div className="flex-1 space-y-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          </div>
        </div>
      }
    >
      <ScreenerContent />
    </Suspense>
  );
}
