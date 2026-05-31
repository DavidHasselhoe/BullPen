'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { Treemap, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowLeft, Grid3X3, RefreshCw, AlertCircle, Search, X } from 'lucide-react';
import { useBackground } from '@/hooks/use-background';
import { useHeatmapStream } from '@/hooks/use-heatmap-stream';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import type { HeatmapResponse, HeatmapStock } from '@/app/api/tools/heatmap/route';
import type { Session } from '@/app/api/market/heatmap/stream/route';

// ─── Color helpers ────────────────────────────────────────────────────────────

function changeToFill(change: number, dimmed: boolean): string {
  const base =
    change > 3 ? '#16a34a' :
    change > 1 ? '#4ade80' :
    change >= 0 ? '#86efac' :
    change >= -1 ? '#fca5a5' :
    change >= -3 ? '#f87171' :
    '#dc2626';

  return dimmed ? base + '66' : base;
}

function changeToTextColor(change: number, dimmed: boolean): string {
  const base = change > 1 || change < -1 ? '#ffffff' : '#111827';
  return dimmed ? base + '99' : base;
}

// ─── Session badge ────────────────────────────────────────────────────────────

function SessionBadge({ session, connected }: { session: Session; connected: boolean }) {
  if (!connected) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        Reconnecting
      </div>
    );
  }

  if (session === 'regular') {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-green-500/30 bg-green-500/10 px-2.5 py-1 text-xs font-medium text-green-500">
        <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
        Live
      </div>
    );
  }
  if (session === 'pre') {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-500">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        Pre-Market
      </div>
    );
  }
  if (session === 'post') {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-500">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        After-Hours
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
      Market Closed
    </div>
  );
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

interface TooltipPos {
  x: number;
  y: number;
  stock: Pick<HeatmapStock, 'ticker' | 'name' | 'change' | 'price'> & {
    previousClose?: number;
    volume?: number;
    isExtended?: boolean;
  };
}

// ─── Cell renderer ────────────────────────────────────────────────────────────

function renderCell(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  nodeProps: any,
  onHover: (pos: TooltipPos | null) => void,
  onNavigate: (ticker: string) => void,
  searchQuery: string
): React.ReactElement {
  const { x, y, width, height, depth, name } = nodeProps;
  const change = (nodeProps.change as number) ?? 0;
  const price = (nodeProps.price as number) ?? 0;
  const previousClose = (nodeProps.previousClose as number | undefined);
  const volume = (nodeProps.volume as number | undefined);
  const isExtended = (nodeProps.isExtended as boolean | undefined) ?? false;
  const fullName = (nodeProps.fullName as string) ?? (name as string);
  const isHighlighted = (nodeProps.isHighlighted as boolean) ?? false;
  const isSearchActive = searchQuery.length > 0;
  const dimmed = isSearchActive && !isHighlighted;

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
  const fill = changeToFill(change, dimmed);
  const textColor = changeToTextColor(change, dimmed);
  const pct = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
  const w = width as number;
  const h = height as number;
  const showTicker = w >= 38 && h >= 28;
  const showPct = w >= 38 && h >= 46;
  const showAbsChange = h >= 60 && w >= 60 && previousClose != null && previousClose > 0;
  const fontSize = Math.min(13, Math.max(8, Math.floor(w / 5)));
  const pctSize = Math.min(11, Math.max(7, Math.floor(w / 6)));
  const absChange = previousClose ? price - previousClose : null;

  // Vertical text centering — distribute lines
  const lineCount = (showTicker ? 1 : 0) + (showPct ? 1 : 0) + (showAbsChange ? 1 : 0);
  const lineH = 13;
  const totalTextH = lineCount * lineH;
  const textStartY = (y as number) + h / 2 - totalTextH / 2 + lineH / 2;

  return (
    <g
      key={`${name as string}-${x as number}-${y as number}`}
      onMouseEnter={(e) =>
        onHover({
          x: e.clientX,
          y: e.clientY,
          stock: { ticker: name as string, name: fullName, change, price, previousClose, volume, isExtended },
        })
      }
      onMouseLeave={() => onHover(null)}
      onClick={() => onNavigate(name as string)}
      style={{ cursor: 'pointer' }}
    >
      <rect
        x={(x as number) + 1}
        y={(y as number) + 1}
        width={Math.max(0, w - 2)}
        height={Math.max(0, h - 2)}
        fill={fill}
        stroke={isHighlighted ? '#ffffff' : 'hsl(var(--background))'}
        strokeWidth={isHighlighted ? 2.5 : 1.5}
        rx={3}
      />
      {showTicker && (
        <text
          x={(x as number) + w / 2}
          y={textStartY}
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
          y={textStartY + (showTicker ? lineH : 0)}
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
      {showAbsChange && absChange != null && (
        <text
          x={(x as number) + w / 2}
          y={textStartY + ((showTicker ? 1 : 0) + (showPct ? 1 : 0)) * lineH}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={textColor}
          fontSize={pctSize}
          fontWeight={400}
          fontFamily="sans-serif"
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {absChange >= 0 ? '+' : ''}${Math.abs(absChange).toFixed(2)}
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

// ─── Sector filter strip ──────────────────────────────────────────────────────

const SECTOR_ORDER = [
  'Information Technology',
  'Health Care',
  'Financials',
  'Consumer Discretionary',
  'Industrials',
  'Communication Services',
  'Consumer Staples',
  'Energy',
  'Real Estate',
  'Materials',
  'Utilities',
];

function SectorFilter({
  sectors,
  active,
  onChange,
}: {
  sectors: string[];
  active: string | null;
  onChange: (s: string | null) => void;
}) {
  const ordered = [
    ...SECTOR_ORDER.filter((s) => sectors.includes(s)),
    ...sectors.filter((s) => !SECTOR_ORDER.includes(s)).sort(),
  ];

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        onClick={() => onChange(null)}
        className={cn(
          'rounded-full px-3 py-1 text-xs font-medium transition-all border',
          active === null
            ? 'bg-primary text-primary-foreground border-primary'
            : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
        )}
      >
        All
      </button>
      {ordered.map((s) => (
        <button
          key={s}
          onClick={() => onChange(active === s ? null : s)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-all border whitespace-nowrap',
            active === s
              ? 'bg-primary text-primary-foreground border-primary'
              : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
          )}
        >
          {s}
        </button>
      ))}
    </div>
  );
}

// ─── Floating tooltip ─────────────────────────────────────────────────────────

function FloatingTooltip({ pos }: { pos: TooltipPos | null }) {
  if (!pos) return null;
  const { x, y, stock } = pos;
  const pct = `${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}%`;
  const absChange =
    stock.previousClose != null && stock.previousClose > 0
      ? stock.price - stock.previousClose
      : null;

  return (
    <div
      className="pointer-events-none fixed z-50 rounded-xl border border-border/60 bg-background/95 backdrop-blur-md shadow-2xl p-3 min-w-[180px]"
      style={{ left: x + 16, top: y - 8 }}
    >
      <div className="flex items-center gap-2 mb-1">
        <p className="font-bold text-sm text-foreground">{stock.ticker}</p>
        {stock.isExtended && (
          <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/20">
            Extended
          </span>
        )}
      </div>
      {stock.name && stock.name !== stock.ticker && (
        <p className="text-xs text-muted-foreground mt-0.5 max-w-[220px] truncate">{stock.name}</p>
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
            {absChange != null && (
              <span className="font-normal ml-1 text-muted-foreground">
                ({absChange >= 0 ? '+' : ''}${Math.abs(absChange).toFixed(2)})
              </span>
            )}
          </span>
        </div>
        {stock.previousClose != null && stock.previousClose > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Prev Close</span>
            <span className="tabular-nums">
              ${stock.previousClose.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
        {stock.volume != null && stock.volume > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Volume</span>
            <span className="tabular-nums">
              {stock.volume >= 1_000_000
                ? `${(stock.volume / 1_000_000).toFixed(1)}M`
                : stock.volume >= 1_000
                ? `${(stock.volume / 1_000).toFixed(0)}K`
                : stock.volume.toString()}
            </span>
          </div>
        )}
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
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const { prices: livePrices, session: liveSession, connected } = useHeatmapStream();
  const [tooltipPos, setTooltipPos] = useState<TooltipPos | null>(null);

  const { data, isLoading, isError, refetch, isFetching } = useQuery<HeatmapResponse>({
    queryKey: ['heatmap'],
    queryFn: () => fetch('/api/tools/heatmap').then((r) => r.json()),
    staleTime: 3 * 60_000,
    refetchInterval: false,
  });

  // Clear search on Escape
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSearchQuery('');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleHover = useCallback((pos: TooltipPos | null) => setTooltipPos(pos), []);

  const handleNavigate = useCallback(
    (ticker: string) => {
      router.push(slugToAssetPath(ticker));
    },
    [router]
  );

  // Determine active session: live stream session (once connected) > initial snapshot session
  const session: Session = liveSession !== 'closed' ? liveSession : (data?.session ?? 'closed');

  // Build treemap data, merging live prices over snapshot
  const allSectorNames = useMemo(
    () => (data?.sectors ?? []).map((s) => s.name),
    [data?.sectors]
  );

  const treemapData = useMemo(() => {
    const upperSearch = searchQuery.toUpperCase().trim();
    const sectors =
      sectorFilter != null
        ? (data?.sectors ?? []).filter((s) => s.name === sectorFilter)
        : (data?.sectors ?? []);

    return sectors.map((sector) => ({
      name: sector.name,
      children: sector.stocks.map((stock) => {
        const live = livePrices.get(stock.ticker);
        return {
          name: stock.ticker,
          value: stock.marketCap,
          fullName: stock.name,
          change: live?.changePercent ?? stock.change,
          price: live?.price ?? stock.price,
          previousClose: live?.previousClose ?? stock.previousClose,
          volume: live?.volume,
          isExtended: stock.isExtended ?? false,
          isHighlighted: upperSearch ? stock.ticker === upperSearch : false,
        };
      }),
    }));
  }, [data?.sectors, livePrices, sectorFilter, searchQuery]);

  const contentRenderer = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (nodeProps: any) => renderCell(nodeProps, handleHover, handleNavigate, searchQuery),
    [handleHover, handleNavigate, searchQuery]
  );

  const lastUpdated = data?.lastUpdated
    ? new Date(data.lastUpdated).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <div className={cn('min-h-screen', hasAnimatedBackground ? '' : 'bg-background')}>
      <div className="fixed inset-0 -z-10 bg-gradient-to-br from-background via-background to-primary/5 pointer-events-none" />

      <main className="container mx-auto max-w-7xl py-10 px-4 sm:px-6 lg:px-8">
        <Link
          href="/tools"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6 group"
        >
          <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
          All tools
        </Link>

        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex items-start justify-between gap-4 flex-wrap mb-5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Grid3X3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">S&amp;P 500 Sector Heatmap</h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                Sized by market cap · colored by today&apos;s performance
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <SessionBadge session={session} connected={connected} />
            {lastUpdated && (
              <span className="text-xs text-muted-foreground tabular-nums">Snapshot {lastUpdated}</span>
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
          </div>
        </motion.div>

        {/* Legend + search + sector filter */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="mb-4 space-y-3"
        >
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <HeatmapLegend />

            {/* Search */}
            <div className="relative flex items-center">
              <Search className="absolute left-2.5 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
              <input
                ref={searchRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value.toUpperCase())}
                placeholder="Find ticker…"
                maxLength={6}
                className="h-8 rounded-lg border border-border bg-background pl-8 pr-7 text-xs font-mono uppercase placeholder:normal-case placeholder:font-sans placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary w-32"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-1.5 text-muted-foreground hover:text-foreground"
                  aria-label="Clear search"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Sector filter pills */}
          {allSectorNames.length > 0 && (
            <SectorFilter
              sectors={allSectorNames}
              active={sectorFilter}
              onChange={setSectorFilter}
            />
          )}
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
              {sectorFilter ? `No data for ${sectorFilter}` : 'No heatmap data available'}
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

        {/* Sector summary cards — reflect live changes */}
        {data?.success && (data.sectors?.length ?? 0) > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.25 }}
            className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
          >
            {(data.sectors ?? []).map((sector) => {
              // Recompute avgChange from live prices where available
              let sum = 0;
              let count = 0;
              for (const stock of sector.stocks) {
                const live = livePrices.get(stock.ticker);
                sum += live?.changePercent ?? stock.change;
                count++;
              }
              const avgChange = count > 0 ? sum / count : sector.avgChange;
              const isPos = avgChange >= 0;
              const pct = `${isPos ? '+' : ''}${avgChange.toFixed(2)}%`;
              const isActive = sectorFilter === sector.name;
              return (
                <button
                  key={sector.name}
                  onClick={() => setSectorFilter(isActive ? null : sector.name)}
                  className={cn(
                    'flex items-center justify-between rounded-xl border px-3 py-2 transition-all text-left',
                    isActive
                      ? 'border-primary/40 bg-primary/10'
                      : 'border-border/40 bg-background/40 hover:border-border/70 hover:bg-background/60'
                  )}
                >
                  <span className="text-sm font-medium truncate">{sector.name}</span>
                  <span className={cn('text-sm font-semibold tabular-nums ml-2 shrink-0', isPos ? 'text-green-500' : 'text-red-500')}>
                    {pct}
                  </span>
                </button>
              );
            })}
          </motion.div>
        )}
      </main>

      <FloatingTooltip pos={tooltipPos} />
    </div>
  );
}
