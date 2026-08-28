'use client';

import { CompanyLogo } from '@/components/company/CompanyLogo';
import { CompanyRowActions } from '@/components/discover/CompanyRowActions';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { fetchWithTimeout } from '@/lib/utils';
import { HOT_PICKS_QUERY_KEY } from '@/lib/discover/hot-picks-query';
import { slugToAssetPath } from '@/lib/assets/asset-type';

interface HotPick {
  ticker: string;
  click_count: number;
  last_clicked_at: string;
  name?: string;
  logo_url?: string | null;
}

interface HotPicksResponse {
  success: boolean;
  data?: HotPick[];
  error?: string;
}

function SkeletonRow({ rank }: { rank: number }) {
  return (
    <div className="flex items-center gap-4 py-3 px-1">
      <span className="text-[32px] font-black tabular-nums text-foreground/25 select-none w-10 text-right shrink-0 leading-none">
        {rank}
      </span>
      <div className="h-8 w-8 rounded-lg animate-shimmer shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3 w-16 animate-shimmer rounded" />
        <div className="h-2.5 w-24 animate-shimmer rounded" />
      </div>
      <div className="h-2.5 w-10 animate-shimmer rounded shrink-0" />
    </div>
  );
}

export function HotPicksCard() {
  const { t } = useTranslation('discover');
  const { data: hotPicks, isLoading } = useQuery<HotPick[]>({
    queryKey: HOT_PICKS_QUERY_KEY,
    queryFn: async () => {
      try {
        const response = await fetchWithTimeout(
          '/api/search/metrics?hours=168&limit=8',
          {},
          10000
        );
        const data: HotPicksResponse = await response.json();
        if (!data.success || !data.data?.length) return [];

        const tickers = data.data.map((pick) => pick.ticker);
        const batchRes = await fetch('/api/companies/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tickers }),
        });
        const batchData = (batchRes.ok
          ? await batchRes.json()
          : { data: [] }) as {
          data?: Array<{ ticker: string; name: string; logo_url: string | null }>;
        };
        const companyMap = new Map(
          (batchData.data || []).map((c) => [
            c.ticker,
            { name: c.name, logo_url: c.logo_url },
          ])
        );

        return data.data.map((pick) => ({
          ...pick,
          name: companyMap.get(pick.ticker)?.name || pick.ticker,
          logo_url: companyMap.get(pick.ticker)?.logo_url || null,
        }));
      } catch (e) {
        const err = e as Error;
        if (err?.name === 'AbortError' || err?.message === 'Failed to fetch') return [];
        throw e;
      }
    },
    staleTime: 30 * 1000,
    refetchOnWindowFocus: true,
    retry: 1,
    gcTime: 30 * 60 * 1000,
  });

  const isEmpty = !hotPicks || hotPicks.length === 0;

  return (
    <div className="min-w-0">
      {/* Editorial section header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-foreground/70 shrink-0">
          {t('hotPicksTitle')}
        </span>
        <div className="flex-1 h-px bg-border/50" />
        <span className="text-[11px] font-mono text-foreground/50 uppercase tracking-wider shrink-0">
          {t('hotPicksByViews')}
        </span>
      </div>

      {isLoading ? (
        <div className="divide-y divide-border/30">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <SkeletonRow key={i} rank={i} />
          ))}
        </div>
      ) : isEmpty ? (
        <p className="text-sm text-muted-foreground py-4">
          {t('hotPicksEmptyState')}
        </p>
      ) : (
        <div className="divide-y divide-border/30">
          {hotPicks.map((pick, index) => (
            <div key={pick.ticker} className="group relative">
              {/* Left accent bar on hover */}
              <div className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 bg-primary opacity-0 group-hover:opacity-100 transition-opacity rounded-full" />

              <div className="flex items-center gap-4 py-3 px-1 -mx-1 rounded-lg hover:bg-accent/40 transition-colors">
                <Link
                  href={slugToAssetPath(pick.ticker)}
                  className="flex flex-1 min-w-0 items-center gap-4"
                >
                  {/* Ghost rank number */}
                  <span className="text-[32px] font-black tabular-nums text-foreground/25 select-none w-10 text-right shrink-0 leading-none">
                    {index + 1}
                  </span>

                  <CompanyLogo
                    name={pick.name || pick.ticker}
                    ticker={pick.ticker}
                    logoUrl={pick.logo_url || null}
                    size={32}
                  />

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-foreground leading-none group-hover:text-primary transition-colors">
                      {pick.ticker}
                    </p>
                    <p className="text-xs text-foreground/55 truncate mt-0.5">
                      {pick.name || pick.ticker}
                    </p>
                  </div>

                  <span className="text-[11px] tabular-nums text-foreground/50 shrink-0 font-mono">
                    {t('hotPicksViewCount', { count: pick.click_count })}
                  </span>
                </Link>

                <CompanyRowActions
                  ticker={pick.ticker}
                  name={pick.name || pick.ticker}
                  className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
