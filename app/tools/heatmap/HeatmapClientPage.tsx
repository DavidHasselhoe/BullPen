'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Treemap, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Grid3X3, RefreshCw, AlertCircle, Radio } from 'lucide-react';
import { useBackground } from '@/hooks/use-background';
import { cn } from '@/lib/utils';
import type { HeatmapResponse, HeatmapStock } from '@/app/api/tools/heatmap/route';

// ─── Color helpers ────────────────────────────────────────────────────────────

function changeToFill(change: number): string {
  if (change > 3) return '#16a34a';
  if (change > 1) return '#4ade80';
  if (change >= 0) return '#86efac';
  if (change >= -1) return '#fca5a5';
  if (change >= -3) return '#f87171';
  return '#dc2626';
}

function changeToTextColor(change: number): string {
  if (change > 1 || change < -1) return '#ffffff';
  return '#111827';
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

interface TooltipPos {
  x: number;
  y: number;
  stock: Pick<HeatmapStock, 'ticker' | 'name' | 'change' | 'price'>;
}

// ─── Cell renderer ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function renderCell(nodeProps: any, onHover: (pos: TooltipPos | null) => void): React.ReactElement {
  const { x, y, width, height, depth, name } = nodeProps;
  const change = (nodeProps.change as number) ?? 0;
  const price = (nodeProps.price as number) ?? 0;
  const fullName = (nodeProps.fullName as string) ?? (name as string);

  if (depth === 0) return <g key="root" />;

  // Sector parent
  if (depth === 1) {
    if ((width as number) < 4 || (height as number) < 4) return <g key={name as string} />;
    return (
      <g key={name as string}>
        <rect
          x={x as number}
          y={y as number}
          width={width as number}
          height={height as number}
          fill="transparent"
          stroke="hsl(var(--border) / 0.6)"
          strokeWidth={2}
          rx={4}
        />
        {(height as number) > 18 && (width as number) > 60 && (
          <text
            x={(x as number) + 8}
            y={(y as number) + 14}
            fill="hsl(var(--muted-foreground))"
            fontSize={10}
            fontWeight={600}
            fontFamily="sans-serif"
            style={{ userSelect: 'none', pointerEvents: 'none' }}
          >
            {name as string}
          </text>
        )}
      </g>
    );
  }

  // Stock leaf
  const fill = changeToFill(change);
  const textColor = changeToTextColor(change);
  const pct = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
  const w = width as number;
  const h = height as number;
  const showTicker = w >= 38 && h >= 28;
  const showPct = w >= 38 && h >= 46;
  const fontSize = Math.min(13, Math.max(8, Math.floor(w / 5)));
  const pctSize = Math.min(11, Math.max(7, Math.floor(w / 6)));

  return (
    <g
      key={`${name as string}-${x as number}-${y as number}`}
      onMouseEnter={(e) =>
        onHover({ x: e.clientX, y: e.clientY, stock: { ticker: name as string, name: fullName, change, price } })
      }
      onMouseLeave={() => onHover(null)}
      style={{ cursor: 'default' }}
    >
      <rect
        x={(x as number) + 1}
        y={(y as number) + 1}
        width={Math.max(0, w - 2)}
        height={Math.max(0, h - 2)}
        fill={fill}
        stroke="hsl(var(--background))"
        strokeWidth={1.5}
        rx={3}
      />
      {showTicker && (
        <text
          x={(x as number) + w / 2}
          y={(y as number) + h / 2 - (showPct ? 8 : 0)}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={textColor}
          fontSize={fontSize}
          fontWeight={700}
          fontFamily="sans-serif"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {name as string}
        </text>
      )}
      {showPct && (
        <text
          x={(x as number) + w / 2}
          y={(y as number) + h / 2 + 11}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={textColor}
          fontSize={pctSize}
          fontWeight={500}
          fontFamily="sans-serif"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {pct}
        </text>
      )}
    </g>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

const LEGEND_STEPS = [
  { color: '#dc2626', label: '< −3%' },
  { color: '#f87171', label: '−3%' },
  { color: '#fca5a5', label: '−1%' },
  { color: '#86efac', label: '0%' },
  { color: '#4ade80', label: '+1%' },
  { color: '#16a34a', label: '> +3%' },
] as const;

function HeatmapLegend() {
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs text-muted-foreground font-medium shrink-0">Performance:</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {LEGEND_STEPS.map((s) => (
          <div key={s.color} className="flex items-center gap-1">
            <div className="h-3 w-4 rounded-sm" style={{ backgroundColor: s.color }} />
            <span className="text-xs text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Floating tooltip ─────────────────────────────────────────────────────────

function FloatingTooltip({ pos }: { pos: TooltipPos | null }) {
  if (!pos) return null;
  const { x, y, stock } = pos;
  const pct = `${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}%`;

  return (
    <div
      className="pointer-events-none fixed z-50 rounded-xl border border-border/60 bg-background/95 backdrop-blur-md shadow-2xl p-3 min-w-[160px]"
      style={{ left: x + 16, top: y - 8 }}
    >
      <p className="font-bold text-sm text-foreground">{stock.ticker}</p>
      {stock.name && stock.name !== stock.ticker && (
        <p className="text-xs text-muted-foreground mt-0.5 max-w-[200px] truncate">{stock.name}</p>
      )}
      <div className="mt-2 space-y-1 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Price</span>
          <span className="font-semibold tabular-nums">
            ${stock.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Change</span>
          <span className={cn('font-semibold tabular-nums', stock.change >= 0 ? 'text-green-500' : 'text-red-500')}>
            {pct}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function HeatmapSkeleton() {
  return (
    <div className="flex gap-2 flex-wrap" style={{ height: '65vh' }}>
      {[35, 25, 15, 10, 8, 7].map((pct, i) => (
        <Skeleton key={i} className="rounded-xl flex-shrink-0" style={{ width: `${pct}%`, height: '100%' }} />
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HeatmapClientPage() {
  const router = useRouter();
  const { hasAnimatedBackground } = useBackground();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<TooltipPos | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<HeatmapResponse>({
    queryKey: ['heatmap'],
    queryFn: () => fetch('/api/tools/heatmap').then((r) => r.json()),
    staleTime: 60_000,
    refetchInterval: autoRefresh ? 60_000 : false,
  });

  const handleHover = useCallback((pos: TooltipPos | null) => setTooltipPos(pos), []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const contentRenderer = useCallback((nodeProps: any) => renderCell(nodeProps, handleHover), [handleHover]);

  const treemapData = (data?.sectors ?? []).map((sector) => ({
    name: sector.name,
    children: sector.stocks.map((stock) => ({
      name: stock.ticker,
      value: stock.marketCap,
      fullName: stock.name,
      change: stock.change,
      price: stock.price,
    })),
  }));

  const lastUpdated = data?.lastUpdated
    ? new Date(data.lastUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className={cn('min-h-screen', hasAnimatedBackground ? '' : 'bg-background')}>
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none" />

      <main className="container mx-auto max-w-7xl py-10 px-4 sm:px-6 lg:px-8">
        <Button
          variant="ghost"
          size="sm"
          className="mb-6 -ml-2 group"
          onClick={() => router.push('/tools')}
        >
          <ArrowLeft className="h-4 w-4 mr-2 group-hover:-translate-x-1 transition-transform" />
          Back to Tools
        </Button>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-start justify-between gap-4 flex-wrap mb-5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Grid3X3 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">S&amp;P 500 Sector Heatmap</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Sized by market cap · colored by today&apos;s performance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {lastUpdated && (
              <span className="text-xs text-muted-foreground tabular-nums">Updated {lastUpdated}</span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              disabled={isFetching}
              className="gap-1.5"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
              Refresh
            </Button>
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              className={cn(
                'flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all',
                autoRefresh
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-muted-foreground hover:text-foreground'
              )}
            >
              <Radio className={cn('h-3 w-3', autoRefresh && 'animate-pulse')} />
              {autoRefresh ? 'Live' : 'Auto-refresh'}
            </button>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="mb-4"
        >
          <HeatmapLegend />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="rounded-2xl border border-border/50 bg-background/60 backdrop-blur-xl shadow-xl p-4"
        >
          {isLoading ? (
            <HeatmapSkeleton />
          ) : isError || !data?.success ? (
            <div className="flex flex-col items-center justify-center gap-4" style={{ height: '65vh' }}>
              <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 max-w-md">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">Failed to load heatmap</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {data?.error ?? 'An unexpected error occurred. Please try again.'}
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={() => refetch()}>Try again</Button>
            </div>
          ) : treemapData.length === 0 ? (
            <div className="flex items-center justify-center text-muted-foreground text-sm" style={{ height: '65vh' }}>
              No heatmap data available
            </div>
          ) : (
            <div style={{ width: '100%', height: '65vh' }}>
              <ResponsiveContainer width="100%" height="100%">
                <Treemap
                  data={treemapData}
                  dataKey="value"
                  nameKey="name"
                  content={contentRenderer}
                  isAnimationActive={false}
                />
              </ResponsiveContainer>
            </div>
          )}
        </motion.div>

        {data?.success && (data.sectors?.length ?? 0) > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.25 }}
            className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {(data.sectors ?? []).map((sector) => {
              const isPos = sector.avgChange >= 0;
              const pct = `${isPos ? '+' : ''}${sector.avgChange.toFixed(2)}%`;
              return (
                <div
                  key={sector.name}
                  className="flex items-center justify-between rounded-xl border border-border/40 bg-background/40 px-3 py-2"
                >
                  <span className="text-sm font-medium truncate">{sector.name}</span>
                  <span className={cn('text-sm font-semibold tabular-nums ml-2 shrink-0', isPos ? 'text-green-500' : 'text-red-500')}>
                    {pct}
                  </span>
                </div>
              );
            })}
          </motion.div>
        )}
      </main>

      <FloatingTooltip pos={tooltipPos} />
    </div>
  );
}
