'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { CompanyStatistics } from '@/lib/twelvedata/twelvedata-client';

interface StatsResponse {
  success: boolean;
  stats?: CompanyStatistics;
  error?: string;
}

function fmt(value: number | null | undefined, type: 'currency' | 'ratio' | 'percent' | 'volume' | 'number' = 'number'): string {
  if (value === null || value === undefined || isNaN(value)) return '—';

  switch (type) {
    case 'currency': {
      const abs = Math.abs(value);
      if (abs >= 1_000_000_000_000) return `$${(value / 1_000_000_000_000).toFixed(2)}T`;
      if (abs >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(2)}B`;
      if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
      return `$${value.toLocaleString()}`;
    }
    case 'percent':
      return `${(value * 100).toFixed(2)}%`;
    case 'ratio':
      return value.toFixed(2);
    case 'volume': {
      if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
      if (value >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
      return value.toLocaleString();
    }
    default:
      return value.toLocaleString();
  }
}

interface StatRow {
  label: string;
  value: string;
  highlight?: boolean;
}

function StatCell({ label, value, highlight }: StatRow) {
  return (
    <div className="flex items-center justify-between gap-2 py-2.5 border-b border-border/50 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-xs font-medium tabular-nums ${highlight ? 'text-foreground' : 'text-foreground/80'}`}>
        {value}
      </span>
    </div>
  );
}

export function StatisticsGrid({ ticker }: { ticker: string }) {
  const { data, isLoading } = useQuery<StatsResponse>({
    queryKey: ['stock-statistics', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/statistics`);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 15 * 60 * 1000, // 15 min
  });

  if (isLoading) {
    return (
      <Card className="mb-8">
        <CardHeader><CardTitle className="text-base font-semibold">Statistics</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-x-8 sm:grid-cols-3">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between py-2.5 border-b border-border/50">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-16" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!data?.success) {
    if (data?.error === 'plan_restricted') {
      return (
        <Card className="mb-8">
          <CardHeader className="pb-2"><CardTitle className="text-base font-semibold">Statistics</CardTitle></CardHeader>
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground py-6 text-center">Statistics require an Enterprise plan.</p>
          </CardContent>
        </Card>
      );
    }
    return null;
  }

  if (!data.stats) return null;

  const s = data.stats;

  const col1: StatRow[] = [
    { label: 'Market Cap', value: fmt(s.marketCap, 'currency'), highlight: true },
    { label: 'Enterprise Value', value: fmt(s.enterpriseValue, 'currency') },
    { label: 'Beta', value: fmt(s.beta, 'ratio') },
    { label: 'Avg Volume', value: fmt(s.avgVolume, 'volume') },
    { label: 'Shares Float', value: fmt(s.sharesFloat, 'volume') },
  ];

  const col2: StatRow[] = [
    { label: 'P/E (TTM)', value: fmt(s.peRatioTTM, 'ratio'), highlight: true },
    { label: 'Forward P/E', value: fmt(s.peRatioForward, 'ratio') },
    { label: 'P/B', value: fmt(s.pbRatio, 'ratio') },
    { label: 'EV/EBITDA', value: fmt(s.evToEbitda, 'ratio') },
    { label: 'Short Ratio', value: fmt(s.shortRatio, 'ratio') },
  ];

  const col3: StatRow[] = [
    { label: '52W High', value: fmt(s.week52High, 'currency'), highlight: true },
    { label: '52W Low', value: fmt(s.week52Low, 'currency') },
    { label: 'Dividend Yield', value: fmt(s.dividendYield, 'percent') },
    { label: 'Profit Margin', value: fmt(s.profitMargin, 'percent') },
    { label: 'Rev Growth', value: fmt(s.revenueGrowthTTM, 'percent') },
  ];

  return (
    <Card className="mb-8">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold">Statistics</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="grid grid-cols-1 gap-x-10 sm:grid-cols-3">
          <div>{col1.map((r) => <StatCell key={r.label} {...r} />)}</div>
          <div>{col2.map((r) => <StatCell key={r.label} {...r} />)}</div>
          <div>{col3.map((r) => <StatCell key={r.label} {...r} />)}</div>
        </div>
      </CardContent>
    </Card>
  );
}
