'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { CompanyLogo } from '@/components/company/CompanyLogo';
import type { CompetitorEntry } from '@/app/api/stock/[ticker]/competitors/route';
import { slugToAssetPath } from '@/lib/assets/asset-type';

interface CompetitorsResponse {
  competitors: CompetitorEntry[];
}

export function CompetitorPills({ ticker }: { ticker: string }) {
  const router = useRouter();

  const { data } = useQuery<CompetitorsResponse>({
    queryKey: ['stock-competitors', ticker],
    queryFn: () => fetch(`/api/stock/${ticker}/competitors`).then((r) => r.json()),
    staleTime: 24 * 60 * 60 * 1000,
    retry: 1,
  });

  const competitors = (data?.competitors ?? []).slice(0, 3);
  if (!competitors.length) return null;

  return (
    <div className="mt-2 flex items-center gap-1.5 flex-wrap">
      <span className="text-xs text-muted-foreground">Peers:</span>
      {competitors.map((c) => (
        <button
          key={c.ticker}
          onClick={() => router.push(slugToAssetPath(c.ticker))}
          className="flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:border-primary/40"
        >
          <CompanyLogo name={c.name} ticker={c.ticker} logoUrl={c.logoUrl} size={14} />
          {c.ticker}
        </button>
      ))}
    </div>
  );
}
