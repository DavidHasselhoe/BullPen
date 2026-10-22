'use client';

import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import { ProGate } from '@/components/billing/ProGate';
import { useEntitlements } from '@/hooks/use-entitlements';
import { useIntlLocale } from '@/hooks/use-intl-locale';
import { LineChart, Line } from '@/components/charts/line-chart';
import { Area } from '@/components/charts/area';
import { Grid } from '@/components/charts/grid';
import { ReferenceLine } from '@/components/charts/reference-line';
import { XAxis } from '@/components/charts/x-axis';
import { ChartTooltip } from '@/components/charts/tooltip';
import type { ScorePoint } from '@/lib/watchlist/scorecard';

/** Same benchmark grey and dash as the holdings chart's S&P 500 line. */
const BENCH_COLOR = '#94a3b8';

function signed(n: number) {
  return `${n > 0 ? '+' : ''}${n.toFixed(2)}%`;
}

function ChartBody({ listId }: { listId: string }) {
  const { t } = useTranslation('watchlist');
  const locale = useIntlLocale();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['watchlist-performance', listId],
    queryFn: async (): Promise<ScorePoint[]> => {
      const res = await fetch(`/api/watchlist/lists/${listId}/performance`);
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error ?? 'failed');
      return body.points ?? [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const chartData = useMemo(
    // Date-only values: noon UTC lands on the same calendar day in every user's zone.
    () => (data ?? []).map((p) => ({ date: new Date(`${p.date}T12:00:00Z`), pct: p.pct, benchPct: p.benchPct, added: p.added })),
    [data],
  );

  if (isLoading) return <Skeleton className="h-[220px] w-full" />;
  if (isError) return <p className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">{t('scorecardChartError')}</p>;
  // One point is a dot, not a line.
  if (chartData.length < 2) return <p className="flex h-[220px] items-center justify-center text-sm text-muted-foreground">{t('scorecardChartEmpty')}</p>;

  const last = chartData[chartData.length - 1];
  const lineColor = last.pct >= 0 ? '#10b981' : '#ef4444';
  const since = new Date(`${data![0].date}T12:00:00Z`).toLocaleDateString(locale, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-1 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden><line x1="0" y1="4" x2="18" y2="4" stroke={lineColor} strokeWidth="2" /></svg>
          {t('scorecardChartPicks')}
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="18" height="8" aria-hidden><line x1="0" y1="4" x2="18" y2="4" stroke={BENCH_COLOR} strokeWidth="1.5" strokeDasharray="4,3" /></svg>
          {t('scorecardChartSp500')}
        </span>
        <span>{t('scorecardChartSince', { date: since })}</span>
      </div>
      <LineChart data={chartData} margin={{ top: 8, right: 8, bottom: 24, left: 8 }} style={{ height: 220 }} zeroBaseline={false}>
        <Grid horizontal />
        <ReferenceLine y={0} strokeDasharray="3,3" strokeOpacity={0.45} />
        <Area dataKey="pct" stroke={lineColor} strokeWidth={2} fill={lineColor} fillOpacity={0.22} showMarkers={false} />
        <Line dataKey="benchPct" stroke={BENCH_COLOR} strokeWidth={1.5} dashFromIndex={0} dashArray="4,3" showMarkers={false} />
        <ChartTooltip
          showYear
          rows={(point) => {
            const rows = [
              { label: t('scorecardChartPicks'), value: signed(point.pct as number), color: lineColor },
              { label: t('scorecardChartSp500'), value: signed(point.benchPct as number), color: BENCH_COLOR },
            ];
            const added = point.added as string[];
            if (added?.length) rows.push({ label: t('scorecardChartAdded'), value: added.join(', '), color: 'transparent' });
            return rows;
          }}
        />
        <XAxis />
      </LineChart>
      <p className="px-1 text-xs text-muted-foreground">{t('scorecardChartNote')}</p>
    </div>
  );
}

/**
 * Pro: the scorecard over time, the list's picks vs the S&P 500 at every close
 * since the first one was added. Free users get the locked placeholder; the
 * route enforces Pro on its own.
 */
export function ListScoreChart({ listId }: { listId: string }) {
  const { t } = useTranslation('watchlist');
  const { isPro } = useEntitlements();

  return (
    <div className="rounded-xl border border-border bg-card p-3">
      <ProGate title={t('scorecardChartProTitle')} description={t('scorecardChartProBody')}>
        {isPro && <ChartBody listId={listId} />}
      </ProGate>
    </div>
  );
}
