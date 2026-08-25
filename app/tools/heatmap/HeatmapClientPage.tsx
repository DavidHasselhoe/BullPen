'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { motion, useReducedMotion } from 'framer-motion';
import { Treemap, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { EmptyState } from '@/components/ui/EmptyState';
import { ArrowLeft, Grid3X3, AlertCircle, Search, X, ListOrdered } from 'lucide-react';
import { useHeatmapStream } from '@/hooks/use-heatmap-stream';
import { useAuth } from '@/components/auth/AuthProvider';
import { cn } from '@/lib/utils';
import { slugToAssetPath } from '@/lib/assets/asset-type';
import type { HeatmapResponse, HeatmapStock, HeatmapSector } from '@/app/api/tools/heatmap/route';
import type { Session } from '@/app/api/market/heatmap/stream/route';

type HeatmapMode = 'sp500' | 'my-stocks';

// ─── Color ramp (Signal Emerald / Signal Red — see DESIGN.md) ─────────────────
// Six steps pulled directly from Tailwind's emerald/red OKLCH scale (the same
// tokens DESIGN.md names Signal Emerald/Signal Red), not an unrelated hardcoded
// green/red hex ramp. Text pairing is computed per step for WCAG AA (4.5:1),
// not a blanket "light change = dark text" heuristic — verified live:
//   red-700   6.6:1 white   red-500  5.5:1 black   red-300  11.0:1 black
//   emerald-300 13.8:1 black   emerald-500 8.4:1 black   emerald-700 5.5:1 white

const INK_LIGHT = 'oklch(0.985 0 0)';
const INK_DARK = 'oklch(0.145 0 0)';

interface RampStep {
  min: number;
  fill: string;
  text: string;
}

const RAMP: RampStep[] = [
  { min: -Infinity, fill: 'oklch(0.505 0.213 27.518)', text: INK_LIGHT }, // red-700
  { min: -3, fill: 'oklch(0.637 0.237 25.331)', text: INK_DARK }, // red-500
  { min: -1, fill: 'oklch(0.808 0.114 19.571)', text: INK_DARK }, // red-300
  { min: 0, fill: 'oklch(0.845 0.143 164.978)', text: INK_DARK }, // emerald-300
  { min: 1, fill: 'oklch(0.696 0.17 162.48)', text: INK_DARK }, // emerald-500
  { min: 3, fill: 'oklch(0.508 0.118 165.612)', text: INK_LIGHT }, // emerald-700
];

function rampStep(change: number): RampStep {
  let step = RAMP[0];
  for (const s of RAMP) if (change >= s.min) step = s;
  return step;
}

function withAlpha(color: string, alpha: number): string {
  return color.replace(/\)$/, ` / ${alpha})`);
}

function changeToFill(change: number, dimmed: boolean): string {
  const { fill } = rampStep(change);
  return dimmed ? withAlpha(fill, 0.35) : fill;
}

function changeToTextColor(change: number, dimmed: boolean): string {
  const { text } = rampStep(change);
  return dimmed ? withAlpha(text, 0.65) : text;
}

const LEGEND_LABELS = ['< −3%', '−3%', '−1%', '0%', '+1%', '> +3%'];
const LEGEND_STEPS = RAMP.map((step, i) => ({ fill: step.fill, label: LEGEND_LABELS[i] }));

// ─── Session helpers ────────────────────────────────────────────────────────

function sessionLabel(session: Session, t: TFunction): string | null {
  if (session === 'pre') return t('heatmapPreMarket', 'Pre-Market');
  if (session === 'post') return t('heatmapPostMarket', 'After-Hours');
  return null;
}

// ─── Session badge ────────────────────────────────────────────────────────────

function SessionBadge({ session, connected }: { session: Session; connected: boolean }) {
  const { t } = useTranslation('tools');

  if (!connected) {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground">
        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        {t('heatmapReconnecting', 'Reconnecting')}
      </div>
    );
  }

  if (session === 'regular') {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
        <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
        {t('heatmapLive', 'Live')}
      </div>
    );
  }
  if (session === 'pre' || session === 'post') {
    return (
      <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs font-medium text-amber-500">
        <span className="h-2 w-2 rounded-full bg-amber-500" />
        {sessionLabel(session, t)}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-border bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground">
      <span className="h-2 w-2 rounded-full bg-muted-foreground/40" />
      {t('heatmapMarketClosed', 'Market Closed')}
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
          rx={6}
        />
        {(height as number) > 18 && (width as number) > 60 && (
          <text
            x={(x as number) + 8}
            y={(y as number) + 14}
            fill="hsl(var(--muted-foreground))"
            fontSize={10}
            fontWeight={600}
            fontFamily="var(--font-geist-sans), sans-serif"
            letterSpacing="0.02em"
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
  const numericFont = 'var(--font-geist-mono), ui-monospace, monospace';
  const numericStyle: React.CSSProperties = {
    userSelect: 'none',
    pointerEvents: 'none',
    fontFeatureSettings: '"tnum"',
  };

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
          stock: { ticker: name as string, name: fullName, change, price, previousClose, volume },
        })
      }
      onMouseLeave={() => onHover(null)}
      onClick={() => onNavigate(name as string)}
      style={{ cursor: 'pointer' }}
    >
      <rect
        className="heatmap-cell"
        x={(x as number) + 1}
        y={(y as number) + 1}
        width={Math.max(0, w - 2)}
        height={Math.max(0, h - 2)}
        fill={fill}
        stroke={isHighlighted ? '#ffffff' : 'hsl(var(--background))'}
        strokeWidth={isHighlighted ? 2.5 : 1.5}
        rx={4}
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
          fontFamily="var(--font-geist-sans), sans-serif"
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
          fontFamily={numericFont}
          style={numericStyle}
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
          fontFamily={numericFont}
          style={numericStyle}
        >
          {absChange >= 0 ? '+' : ''}${Math.abs(absChange).toFixed(2)}
        </text>
      )}
    </g>
  );
}

// ─── Legend ───────────────────────────────────────────────────────────────────

function HeatmapLegend() {
  const { t } = useTranslation('tools');
  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs text-muted-foreground font-medium shrink-0">{t('heatmapPerformanceLabel', 'Performance:')}</span>
      <div className="flex items-center gap-1.5 flex-wrap">
        {LEGEND_STEPS.map((s) => (
          <div key={s.label} className="flex items-center gap-1">
            <div className="h-3 w-4 rounded-sm" style={{ backgroundColor: s.fill }} />
            <span className="text-xs text-muted-foreground">{s.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sector filter strip (quick access — stays in fixed GICS order rather ────
// than re-sorting by performance, so pills don't jump around as prices move
// and stay muscle-memory-findable. The Sector Leaderboard below is the
// rank-sorted view; the two intentionally serve different jobs. ─────────────

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
  const { t } = useTranslation('tools');
  const ordered = [
    ...SECTOR_ORDER.filter((s) => sectors.includes(s)),
    ...sectors.filter((s) => !SECTOR_ORDER.includes(s)).sort(),
  ];

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <button
        onClick={() => onChange(null)}
        className={cn(
          'rounded-full px-3 py-1 text-xs font-medium transition-colors border',
          active === null
            ? 'bg-primary text-primary-foreground border-primary'
            : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
        )}
      >
        {t('heatmapSectorAll', 'All')}
      </button>
      {ordered.map((s) => (
        <button
          key={s}
          onClick={() => onChange(active === s ? null : s)}
          className={cn(
            'rounded-full px-3 py-1 text-xs font-medium transition-colors border whitespace-nowrap',
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

function FloatingTooltip({ pos, session }: { pos: TooltipPos | null; session: Session }) {
  const { t } = useTranslation('tools');
  if (!pos) return null;
  const { x, y, stock } = pos;
  const pct = `${stock.change >= 0 ? '+' : ''}${stock.change.toFixed(2)}%`;
  const extended = sessionLabel(session, t);
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
        {extended && (
          <span className="text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/20">
            {extended}
          </span>
        )}
      </div>
      {stock.name && stock.name !== stock.ticker && (
        <p className="text-xs text-muted-foreground mt-0.5 max-w-[220px] truncate">{stock.name}</p>
      )}
      <div className="mt-2 space-y-1 text-xs">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{t('heatmapTooltipPrice', 'Price')}</span>
          <span className="font-mono tabular-nums font-semibold">
            ${stock.price.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">{t('heatmapTooltipChange', 'Change')}</span>
          <span className={cn('font-mono tabular-nums font-semibold', stock.change >= 0 ? 'text-emerald-400' : 'text-red-400')}>
            {pct}
            {absChange != null && (
              <span className="font-normal ml-1 text-muted-foreground">
                ({absChange >= 0 ? '+' : '-'}${Math.abs(absChange).toFixed(2)})
              </span>
            )}
          </span>
        </div>
        {stock.previousClose != null && stock.previousClose > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t('heatmapTooltipPrevClose', 'Prev Close')}</span>
            <span className="font-mono tabular-nums">
              ${stock.previousClose.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        )}
        {stock.volume != null && stock.volume > 0 && (
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">{t('heatmapTooltipVolume', 'Volume')}</span>
            <span className="font-mono tabular-nums">
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

// ─── Sector Leaderboard ─────────────────────────────────────────────────────
// Ranked, best-to-worst, mirroring the diverging-bar-around-zero-line language
// already established on Discover's "Where money moved" (SectorRow.tsx) —
// same emerald-400/red-400 bars, same signed-percentage-carries-the-meaning
// approach, same staggered growth-from-zero entrance. Replaces the old flat
// grid of sector buttons with something that reads as an actual ranking.

interface LeaderboardRow {
  name: string;
  avgChange: number;
}

function SectorLeaderboardRow({
  row,
  rank,
  scale,
  active,
  grown,
  index,
  onSelect,
}: {
  row: LeaderboardRow;
  rank: number;
  scale: number;
  active: boolean;
  grown: boolean;
  index: number;
  onSelect: () => void;
}) {
  const positive = row.avgChange >= 0;
  const width = scale > 0 ? Math.min(50, (Math.abs(row.avgChange) / scale) * 50) : 0;
  const pct = `${positive ? '+' : ''}${row.avgChange.toFixed(2)}%`;

  return (
    <li className="border-b border-border/25 last:border-b-0">
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={cn(
          'flex w-full items-center gap-3 px-3 py-2.5 text-left sm:gap-4 sm:px-4',
          'transition-colors duration-150 hover:bg-muted/25',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
          active && 'bg-primary/10'
        )}
      >
        <span className="w-5 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground/70">
          {rank}
        </span>
        <span className="min-w-0 shrink-0 basis-[104px] truncate text-[13px] font-medium text-foreground sm:basis-[188px]">
          {row.name}
        </span>

        {/* Diverging bar. Decorative — the signed percentage beside it carries
            the meaning for anyone who can't distinguish the colours. */}
        <span className="relative h-5 min-w-0 flex-1" aria-hidden>
          <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-border/50" />
          <span
            className={cn(
              'absolute top-1/2 h-2.5 -translate-y-1/2 rounded-sm transition-transform duration-300 ease-out',
              positive ? 'left-1/2 origin-left bg-emerald-400/85' : 'right-1/2 origin-right bg-red-400/85'
            )}
            style={{
              width: `${width}%`,
              transform: `scaleX(${grown ? 1 : 0})`,
              transitionDelay: `${index * 25}ms`,
            }}
          />
        </span>

        <span
          className={cn(
            'shrink-0 basis-[68px] text-right font-mono text-[13px] font-semibold tabular-nums',
            positive ? 'text-emerald-400' : 'text-red-400'
          )}
        >
          {pct}
        </span>
      </button>
    </li>
  );
}

function SectorLeaderboard({
  sectors,
  livePrices,
  sectorFilter,
  onSelect,
}: {
  sectors: HeatmapSector[];
  livePrices: Map<string, { changePercent?: number }>;
  sectorFilter: string | null;
  onSelect: (name: string) => void;
}) {
  const prefersReducedMotion = useReducedMotion();
  const [grown, setGrown] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const rows = useMemo<LeaderboardRow[]>(() => {
    const computed = sectors.map((sector) => {
      let sum = 0;
      let count = 0;
      for (const stock of sector.stocks) {
        const live = livePrices.get(stock.ticker);
        sum += live?.changePercent ?? stock.change;
        count++;
      }
      return { name: sector.name, avgChange: count > 0 ? sum / count : sector.avgChange };
    });
    return computed.sort((a, b) => b.avgChange - a.avgChange);
  }, [sectors, livePrices]);

  const scale = useMemo(() => {
    const max = Math.max(...rows.map((r) => Math.abs(r.avgChange)), 0);
    return max > 0 ? max : 1;
  }, [rows]);

  const { t } = useTranslation('tools');

  if (rows.length === 0) return null;

  return (
    <section aria-labelledby="leaderboard-heading">
      <div className="mb-3 flex items-center gap-2">
        <ListOrdered className="h-4 w-4 text-primary" aria-hidden />
        <h2 id="leaderboard-heading" className="text-lg font-semibold tracking-tight text-foreground">
          {t('heatmapSectorLeaderboard', 'Sector Leaderboard')}
        </h2>
      </div>
      <div className="overflow-hidden rounded-xl border border-border/50 bg-background/40">
        <ul>
          {rows.map((row, i) => (
            <SectorLeaderboardRow
              key={row.name}
              row={row}
              rank={i + 1}
              scale={scale}
              active={sectorFilter === row.name}
              grown={prefersReducedMotion ? true : grown}
              index={i}
              onSelect={() => onSelect(row.name)}
            />
          ))}
        </ul>
      </div>
    </section>
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
  const { t } = useTranslation('tools');
  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();
  const { isAuthenticated } = useAuth();
  const [mode, setMode] = useState<HeatmapMode>('sp500');
  const [sectorFilter, setSectorFilter] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const { prices: livePrices, session: liveSession, connected } = useHeatmapStream();
  const [tooltipPos, setTooltipPos] = useState<TooltipPos | null>(null);

  const { data, isLoading, isError, refetch } = useQuery<HeatmapResponse>({
    queryKey: ['heatmap', mode],
    queryFn: () => fetch(`/api/tools/heatmap?mode=${mode}`).then((r) => r.json()),
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

  const handleSectorSelect = useCallback((name: string) => {
    setSectorFilter((cur) => (cur === name ? null : name));
  }, []);

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

  const motionProps = prefersReducedMotion
    ? {}
    : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 } };

  return (
    <div className="min-h-screen">
      <main className="container mx-auto max-w-7xl pt-10 pb-20 px-4 sm:px-6 lg:px-8">
        <Link
          href="/tools"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mb-6 group"
        >
          <ArrowLeft className="h-3 w-3 transition-transform group-hover:-translate-x-0.5" />
          {t('allToolsLink', 'All tools')}
        </Link>

        <motion.div
          {...motionProps}
          transition={{ duration: 0.3 }}
          className="flex items-start justify-between gap-4 flex-wrap mb-5"
        >
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <Grid3X3 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                {mode === 'my-stocks' ? t('heatmapMyStocksTitle', 'My Stocks Heatmap') : t('heatmapSp500Title', 'S&P 500 Sector Heatmap')}
              </h1>
              <p className="text-muted-foreground text-sm mt-0.5">
                {t('heatmapSubtitle', "Sized by market cap · colored by today's performance")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {isAuthenticated && (
              <Tabs value={mode} onValueChange={(v) => setMode(v as HeatmapMode)}>
                <TabsList>
                  <TabsTrigger value="sp500">{t('heatmapSp500Tab', 'S&P 500')}</TabsTrigger>
                  <TabsTrigger value="my-stocks">{t('heatmapMyStocksTab', 'My Stocks')}</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <SessionBadge session={session} connected={connected} />
            {!connected && lastUpdated && (
              <span className="text-xs text-muted-foreground tabular-nums">{t('heatmapAsOf', 'As of {{time}}', { time: lastUpdated })}</span>
            )}
          </div>
        </motion.div>

        {/* Legend + search + sector filter */}
        <motion.div
          {...motionProps}
          transition={{ duration: 0.3, delay: prefersReducedMotion ? 0 : 0.05 }}
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
                  aria-label={t('heatmapClearSearch', 'Clear search')}
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
          {...motionProps}
          transition={{ duration: 0.35, delay: prefersReducedMotion ? 0 : 0.1 }}
          className="rounded-2xl border border-border/50 bg-background/60 backdrop-blur-xl p-4"
        >
          {isLoading ? (
            <HeatmapSkeleton />
          ) : isError || !data?.success ? (
            <div className="flex flex-col items-center justify-center gap-4" style={{ height: '65vh' }}>
              <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 max-w-md">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-destructive">{t('heatmapErrorTitle', 'Failed to load heatmap')}</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {data?.error ?? t('heatmapErrorFallback', 'An unexpected error occurred. Please try again.')}
                  </p>
                </div>
              </div>
              <Button variant="outline" onClick={() => refetch()}>{t('tryAgainButton', 'Try again')}</Button>
            </div>
          ) : treemapData.length === 0 ? (
            <div className="flex h-[55vh] items-center justify-center sm:h-[65vh]">
              {mode === 'my-stocks' && !sectorFilter ? (
                <EmptyState
                  pose="shrug"
                  title={t('heatmapMyStocksEmptyTitle', 'Nothing to show yet')}
                  description={t('heatmapMyStocksEmptyDescription', 'Add a stock to your holdings or watchlist to see it here.')}
                  imageSize={120}
                >
                  <div className="flex justify-center gap-3 text-xs">
                    <Link href="/holdings" className="text-primary underline-offset-4 hover:underline">
                      {t('heatmapGoToHoldings', 'Go to Holdings')}
                    </Link>
                    <Link href="/watchlist" className="text-primary underline-offset-4 hover:underline">
                      {t('heatmapGoToWatchlist', 'Go to Watchlist')}
                    </Link>
                  </div>
                </EmptyState>
              ) : (
                <EmptyState
                  pose="shrug"
                  title={sectorFilter ? t('heatmapNoDataForSector', 'No data for {{sector}}', { sector: sectorFilter }) : t('heatmapNoDataGeneric', 'No heatmap data available')}
                  imageSize={120}
                />
              )}
            </div>
          ) : (
            <div className="h-[55vh] w-full sm:h-[65vh]">
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

        {/* Sector Leaderboard — ranked, reflects live changes */}
        {data?.success && (data.sectors?.length ?? 0) > 0 && (
          <motion.div
            {...motionProps}
            transition={{ duration: 0.3, delay: prefersReducedMotion ? 0 : 0.25 }}
            className="mt-8"
          >
            <SectorLeaderboard
              sectors={data.sectors ?? []}
              livePrices={livePrices}
              sectorFilter={sectorFilter}
              onSelect={handleSectorSelect}
            />
          </motion.div>
        )}

        <p className="mt-6 text-center text-[11px] text-muted-foreground/70">
          {t(
            'heatmapFooterNote',
            'Prices stream live via WebSocket during market hours. Sector and market-cap classification refresh periodically.'
          )}
        </p>
      </main>

      <FloatingTooltip pos={tooltipPos} session={session} />
    </div>
  );
}
