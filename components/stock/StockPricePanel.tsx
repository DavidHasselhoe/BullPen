'use client';

import { useState, useMemo } from 'react';

import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, ReferenceLine, ReferenceDot,
  BarChart, Bar, Cell,
} from 'recharts';
import { useChartPrefs } from '@/hooks/use-chart-prefs';
import { ChartSettingsPanel } from './ChartSettingsPanel';
import type { CompanyEarnings } from '@/lib/twelvedata/twelvedata-client';
import { useTheme } from 'next-themes';
import { Skeleton } from '@/components/ui/skeleton';
import { useLivePrices } from '@/hooks/use-live-prices';
import { useStockQuote } from '@/hooks/use-stock-price';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import { cn } from '@/lib/utils';
import type { IndicatorValue, ExtendedHoursQuote } from '@/lib/twelvedata/twelvedata-client';

// ─── Types ────────────────────────────────────────────────────────────────────

type Range = '1D' | '1W' | '1M' | '6M' | '1Y' | 'YTD' | '5Y' | 'MAX';
const RANGES: Range[] = ['1D', '1W', '1M', '6M', '1Y', 'YTD', '5Y', 'MAX'];

// Display labels shown on buttons
const RANGE_DISPLAY: Record<Range, string> = {
  '1D': '1D', '1W': '5D', '1M': '1M', '6M': '6M', '1Y': '1Y', 'YTD': 'YTD', '5Y': '5Y', 'MAX': 'ALL',
};
// Human-readable label used in the performance banner
const RANGE_LABEL: Record<Range, string> = {
  '1D': 'today', '1W': 'this week', '1M': 'this month',
  '6M': 'past 6 months', '1Y': 'past year', 'YTD': 'year to date', '5Y': 'past 5 years', 'MAX': 'all time',
};

type Indicator = 'sma50' | 'sma200' | 'ema20' | 'bbands' | 'rsi' | 'macd';
interface IndicatorOption { key: Indicator; label: string; type: string; params?: Record<string, number> }

const INDICATORS: IndicatorOption[] = [
  { key: 'sma50',  label: 'SMA 50',  type: 'sma',    params: { time_period: 50 } },
  { key: 'sma200', label: 'SMA 200', type: 'sma',    params: { time_period: 200 } },
  { key: 'ema20',  label: 'EMA 20',  type: 'ema',    params: { time_period: 20 } },
  { key: 'bbands', label: 'BB',      type: 'bbands', params: { time_period: 20 } },
  { key: 'rsi',    label: 'RSI',     type: 'rsi',    params: { time_period: 14 } },
  { key: 'macd',   label: 'MACD',    type: 'macd' },
];

const OSCILLATOR_INDICATORS = new Set<Indicator>(['rsi', 'macd']);

interface CandleData { t: number[]; c: number[]; o: number[]; h: number[]; l: number[]; v: number[]; session?: Array<'pre' | 'regular' | 'post'> }
interface ChartPoint {
  time: number; label: string; price: number; volume: number;
  session?: 'pre' | 'regular' | 'post';
  regularPrice?: number;
  extPrice?: number;
  sma?: number; ema?: number; upper?: number; lower?: number; middle?: number;
  rsi?: number; macd?: number; signal?: number; hist?: number;
}

interface IndicatorResponse {
  success: boolean;
  data?: IndicatorValue[];
  error?: string;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function fmtVol(v: number): string {
  if (v >= 1e9) return `${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}
function fmtLabel(ts: number, range: Range): string {
  const d = new Date(ts * 1000);
  if (range === '1D') return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (range === '1W' || range === '1M') return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  if (range === '6M' || range === '1Y') return d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' });
  return d.getFullYear().toString();
}

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, basePrice, range }: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  basePrice: number;
  range: Range;
}) {
  if (!active || !payload?.length) return null;
  const pt = payload[0].payload;
  const diff = pt.price - basePrice;
  const pct = basePrice ? (diff / basePrice) * 100 : 0;
  const isPos = diff >= 0;
  const d = new Date(pt.time * 1000);
  const dateStr = range === '1D'
    ? d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const sessionLabel = range === '1D' && pt.session
    ? pt.session === 'pre' ? 'Pre-market' : pt.session === 'post' ? 'After-hours' : null
    : null;
  return (
    <div className="rounded-lg border border-border bg-background/95 px-3 py-2 shadow-lg backdrop-blur-sm text-xs space-y-0.5">
      <p className="font-semibold text-foreground tabular-nums">{fmtPrice(pt.price)}</p>
      <p className={cn('tabular-nums', isPos ? 'text-emerald-400' : 'text-red-400')}>
        {isPos ? '+' : ''}{diff.toFixed(2)} ({isPos ? '+' : ''}{pct.toFixed(2)}%)
      </p>
      <p className="text-muted-foreground">{dateStr}</p>
      {sessionLabel && <p className="text-muted-foreground/70 italic">{sessionLabel}</p>}
      {pt.volume > 0 && <p className="text-muted-foreground">Vol {fmtVol(pt.volume)}</p>}
    </div>
  );
}

// ─── Stat item (bottom bar) ───────────────────────────────────────────────────

function StatItem({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50 shrink-0">{label}</span>
      <span className={cn('text-xs font-medium tabular-nums text-foreground truncate', valueClass)}>{value}</span>
    </div>
  );
}

function fetchIndicator(ticker: string, opt: IndicatorOption, range: Range): Promise<IndicatorResponse> {
  const params = new URLSearchParams({ type: opt.type, range });
  if (opt.params) {
    for (const [k, v] of Object.entries(opt.params)) params.set(k, String(v));
  }
  return fetch(`/api/stock/${ticker}/indicator?${params}`).then(r => r.json());
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StockPricePanel({ ticker }: { ticker: string }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const { prefs, setPref, reset: resetPrefs } = useChartPrefs();
  const [range, setRange] = useState<Range>(prefs.defaultRange as Range);

  const [activeIndicators, setActiveIndicators] = useState<Set<Indicator>>(
    new Set(prefs.defaultIndicators as Indicator[])
  );
  const { isSimplified } = useExperienceLevel();

  function toggleIndicator(key: Indicator) {
    setActiveIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // ── Data sources ─────────────────────────────────────────────────────────
  const livePrices = useLivePrices([ticker]);
  const live = livePrices.get(ticker);
  const isLive = !!live;

  const { data: extHoursData } = useQuery<{ success: boolean; data: ExtendedHoursQuote | null }>({
    queryKey: ['extended-hours', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/extended-hours`);
      return res.json();
    },
    enabled: !!ticker,
    staleTime: 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
  const extHours = extHoursData?.data ?? null;

  const { data: restQuote, isLoading: quoteLoading } = useStockQuote(ticker);

  const livePrice = live?.price;
  const restClose = restQuote?.c ?? 0;
  const restChange = restQuote?.d ?? 0;
  const restPct = restQuote?.dp ?? 0;
  const prevClose = restQuote?.pc ?? 0;
  const dayHigh   = restQuote?.h ?? 0;
  const dayLow    = restQuote?.l ?? 0;
  const openPrice = restQuote?.o ?? 0;

  const showDual = !!extHours && prefs.showExtendedHours;

  // Left block — regular-session close + its published change (static)
  const closePrice = restClose;
  const closeChange = restChange;
  const closePct = restPct;
  const closeIsPos = closePct >= 0;

  // Single-mode current price (regular hours, live during 9:30–4)
  const price     = livePrice ?? restClose;
  const change    = prevClose > 0 ? price - prevClose : restChange;
  const changePct = prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : restPct;

  const isPositive = changePct >= 0;
  const priceColor = isPositive ? 'text-emerald-400' : 'text-red-400';

  // ── Candle data ───────────────────────────────────────────────────────────
  const { data: candleData, isLoading: candleLoading, isFetching } = useQuery<{
    success: boolean; candles: CandleData | null; range: Range;
  }>({
    queryKey: ['stock-candles', ticker, range],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/candles?range=${range}`);
      return res.json();
    },
    enabled: !!ticker,
    // 1D uses 1-min candles — treat as stale after 60 s and poll every 60 s.
    // Longer ranges use daily candles; 5-min stale time is fine.
    staleTime: range === '1D' ? 60 * 1000 : 5 * 60 * 1000,
    refetchInterval: range === '1D' ? 60 * 1000 : false,
  });

  // ── Earnings (for overlay) ────────────────────────────────────────────────
  const { data: earningsResp } = useQuery<{ success: boolean; earnings: CompanyEarnings[] }>({
    queryKey: ['company-earnings', ticker],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/earnings`);
      return res.json();
    },
    enabled: !!ticker && prefs.showEarnings,
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  // ── Indicator queries ─────────────────────────────────────────────────────
  const sma50Query  = useQuery<IndicatorResponse>({ queryKey: ['indicator', ticker, 'sma50',  range], queryFn: () => fetchIndicator(ticker, INDICATORS[0], range), enabled: activeIndicators.has('sma50')  && !!ticker, staleTime: 5 * 60 * 1000 });
  const sma200Query = useQuery<IndicatorResponse>({ queryKey: ['indicator', ticker, 'sma200', range], queryFn: () => fetchIndicator(ticker, INDICATORS[1], range), enabled: activeIndicators.has('sma200') && !!ticker, staleTime: 5 * 60 * 1000 });
  const ema20Query  = useQuery<IndicatorResponse>({ queryKey: ['indicator', ticker, 'ema20',  range], queryFn: () => fetchIndicator(ticker, INDICATORS[2], range), enabled: activeIndicators.has('ema20')  && !!ticker, staleTime: 5 * 60 * 1000 });
  const bbandsQuery = useQuery<IndicatorResponse>({ queryKey: ['indicator', ticker, 'bbands', range], queryFn: () => fetchIndicator(ticker, INDICATORS[3], range), enabled: activeIndicators.has('bbands') && !!ticker, staleTime: 5 * 60 * 1000 });
  const rsiQuery    = useQuery<IndicatorResponse>({ queryKey: ['indicator', ticker, 'rsi',   range], queryFn: () => fetchIndicator(ticker, INDICATORS[4], range), enabled: activeIndicators.has('rsi')    && !!ticker, staleTime: 5 * 60 * 1000 });
  const macdQuery   = useQuery<IndicatorResponse>({ queryKey: ['indicator', ticker, 'macd',  range], queryFn: () => fetchIndicator(ticker, INDICATORS[5], range), enabled: activeIndicators.has('macd')   && !!ticker, staleTime: 5 * 60 * 1000 });

  const sma50Data  = sma50Query.data?.data;
  const sma200Data = sma200Query.data?.data;
  const ema20Data  = ema20Query.data?.data;
  const bbandsData = bbandsQuery.data?.data;
  const rsiData    = rsiQuery.data?.data;
  const macdData   = macdQuery.data?.data;

  // ── Chart data ────────────────────────────────────────────────────────────
  const chartData = useMemo<ChartPoint[]>(() => {
    if (!candleData?.candles) return [];
    const { t, c, v, session } = candleData.candles;
    const pts: ChartPoint[] = t.map((ts, i) => ({
      time: ts, label: fmtLabel(ts, range), price: c[i], volume: v[i],
      session: session?.[i],
    }));

    if (range === '1D' && session?.length === pts.length) {
      pts.forEach((pt, i) => {
        const sess = session[i];
        const prevSess = i > 0 ? session[i - 1] : null;
        const nextSess = i < session.length - 1 ? session[i + 1] : null;
        if (sess === 'regular') {
          pt.regularPrice = pt.price;
          if (prevSess === 'pre') pt.extPrice = pt.price;
          if (nextSess === 'post') pt.extPrice = pt.price;
        } else {
          pt.extPrice = pt.price;
          if (sess === 'pre' && nextSess === 'regular') pt.regularPrice = pt.price;
          if (sess === 'post' && prevSess === 'regular') pt.regularPrice = pt.price;
        }
      });
    }

    function applyIndicator(values: IndicatorValue[], key: Indicator) {
      const map = new Map<string, IndicatorValue>();
      for (const iv of values) map.set(iv.datetime.slice(0, 10), iv);
      for (const pt of pts) {
        const iv = map.get(new Date(pt.time * 1000).toISOString().slice(0, 10));
        if (!iv) continue;
        if (key === 'sma50' || key === 'sma200') pt.sma = iv.sma as number;
        if (key === 'ema20') pt.ema = iv.ema as number;
        if (key === 'bbands') { pt.upper = iv.upper_band as number; pt.middle = iv.middle_band as number; pt.lower = iv.lower_band as number; }
        if (key === 'rsi') pt.rsi = iv.rsi as number;
        if (key === 'macd') { pt.macd = iv.macd as number; pt.signal = iv.macd_signal as number; pt.hist = iv.macd_hist as number; }
      }
    }

    if (sma50Data?.length)  applyIndicator(sma50Data,  'sma50');
    if (sma200Data?.length) applyIndicator(sma200Data, 'sma200');
    if (ema20Data?.length)  applyIndicator(ema20Data,  'ema20');
    if (bbandsData?.length) applyIndicator(bbandsData, 'bbands');
    if (rsiData?.length)    applyIndicator(rsiData,    'rsi');
    if (macdData?.length)   applyIndicator(macdData,   'macd');

    return pts;
  }, [candleData, range, sma50Data, sma200Data, ema20Data, bbandsData, rsiData, macdData]);

  // Append live tick so chart always ends at current price
  const displayData = useMemo<ChartPoint[]>(() => {
    if (range !== '1D' || !isLive || !live || !chartData.length) return chartData;
    // eslint-disable-next-line react-hooks/purity
    const nowSec = Math.floor(Date.now() / 1000);
    const last = chartData[chartData.length - 1];
    if (Math.abs(last.time - nowSec) < 120) return chartData;

    const etTimeStr = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false });
    const [etHStr, etMStr] = etTimeStr.split(':');
    const etMins = parseInt(etHStr) * 60 + parseInt(etMStr);
    const liveSession: 'pre' | 'regular' | 'post' = etMins < 570 ? 'pre' : etMins >= 960 ? 'post' : 'regular';

    const livePt: ChartPoint = {
      time: nowSec, label: fmtLabel(nowSec, '1D'), price: live.price, volume: 0, session: liveSession,
    };
    if (chartData[0]?.session !== undefined) {
      if (liveSession === 'regular') livePt.regularPrice = live.price;
      else livePt.extPrice = live.price;
    }
    return [...chartData, livePt];
  }, [chartData, range, isLive, live]);

  const sessionBoundaries = useMemo(() => {
    if (range !== '1D') return { openTime: undefined, closeTime: undefined };
    let openTime: number | undefined;
    let closeTime: number | undefined;
    for (let i = 1; i < chartData.length; i++) {
      if (!openTime && chartData[i].session === 'regular' && chartData[i - 1]?.session === 'pre') openTime = chartData[i].time;
      if (!closeTime && chartData[i].session === 'post' && chartData[i - 1]?.session === 'regular') closeTime = chartData[i].time;
    }
    return { openTime, closeTime };
  }, [chartData, range]);

  // When extended hours are hidden, strip pre/post candles so the chart shows
  // only regular-session data (avoids a jagged gap at market open).
  const chartDisplayData = useMemo(() => {
    if (range !== '1D' || prefs.showExtendedHours) return displayData;
    const hasSession = displayData.some((d) => d.session !== undefined);
    if (!hasSession) return displayData;
    return displayData.filter((d) => !d.session || d.session === 'regular');
  }, [displayData, range, prefs.showExtendedHours]);

  // Earnings markers — filter to dates visible in the current chart window.
  const earningsMarkers = useMemo<Array<{ ts: number; beat: boolean | null }>>(() => {
    if (!prefs.showEarnings || !earningsResp?.earnings?.length || !chartDisplayData.length) return [];
    const chartStart = chartDisplayData[0].time;
    const chartEnd   = chartDisplayData[chartDisplayData.length - 1].time;
    return earningsResp.earnings
      .map((e) => {
        // Convert "YYYY-MM-DD" to Unix seconds, using noon UTC so it lands inside the trading day.
        const ts = Math.floor(new Date(`${e.period}T12:00:00Z`).getTime() / 1000);
        const beat = e.actual != null && e.estimate != null ? e.actual >= e.estimate : null;
        return { ts, beat };
      })
      .filter(({ ts }) => ts >= chartStart && ts <= chartEnd);
  }, [prefs.showEarnings, earningsResp, chartDisplayData]);

  // Right block (dual mode) — derive extended price from the last candle when it's a
  // pre/post session so the header and chart tooltip always read from the same source.
  // Only fall back to the extended-hours API price when candles haven't loaded yet.
  const lastDisplayPt = displayData.length > 0 ? displayData[displayData.length - 1] : null;
  const lastIsExtended = lastDisplayPt?.session === 'pre' || lastDisplayPt?.session === 'post';
  const extPriceVal = livePrice
    ?? (showDual && lastIsExtended && lastDisplayPt ? lastDisplayPt.price : null)
    ?? extHours?.price
    ?? 0;
  const extDiff = closePrice > 0 ? extPriceVal - closePrice : (extHours?.change ?? 0);
  const extPct  = closePrice > 0 ? (extDiff / closePrice) * 100 : (extHours?.changePercent ?? 0);
  const extIsPos = extDiff >= 0;

  const firstPrice = chartDisplayData[0]?.price ?? 0;
  const chartLast  = chartDisplayData[chartDisplayData.length - 1]?.price ?? 0;
  // In dual mode (pre/post-market) anchor to regular-session close, not prev_close,
  // so tooltip change and the perf banner both reflect move vs today's close.
  const dayBase    = showDual ? closePrice : prevClose;
  const chartBase  = range === '1D' && dayBase > 0 ? dayBase : firstPrice;
  const chartDiff  = chartLast - chartBase;
  const chartPct   = chartBase ? (chartDiff / chartBase) * 100 : 0;
  const chartIsPos = chartDiff >= 0;
  // Brighter saturated green to match the reference design
  const lineColor  = chartIsPos ? '#22c55e' : '#ef4444';
  const gradientId = `pg-${ticker}`;

  const priceMin = chartDisplayData.length ? Math.min(...chartDisplayData.map(d => d.price)) : 0;
  const priceMax = chartDisplayData.length ? Math.max(...chartDisplayData.map(d => d.price)) : 0;
  const yPad     = (priceMax - priceMin) * 0.06;

  const textColor    = isDark ? '#3f3f46' : '#c4c4c8';

  const isLoadingChart  = (candleLoading || isFetching) && !candleData?.candles;
  const hasChart        = chartDisplayData.length > 0;
  const activeOscillators = [...activeIndicators].filter((i) => OSCILLATOR_INDICATORS.has(i));
  const showOscillator  = hasChart && !isSimplified && activeOscillators.length > 0;

  // ── For the range performance banner above the tabs ───────────────────────
  // 1D dual (pre/post): use extended-hours change vs regular close.
  // 1D single (regular session): use live change vs prev close.
  // Other ranges: use chart-derived value.
  const perfIsPos = range === '1D' ? (showDual ? extIsPos  : isPositive) : chartIsPos;
  const perfPct   = range === '1D' ? (showDual ? extPct    : changePct)  : chartPct;
  const perfDiff  = range === '1D' ? (showDual ? extDiff   : change)     : chartDiff;

  if (quoteLoading && !restQuote && !live) {
    return (
      <div className="mb-8 rounded-2xl border border-border bg-card p-6 space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-12 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (!price && !quoteLoading) return null;

  return (
    <div className="mb-8 rounded-2xl border border-border bg-card overflow-hidden">

      {/* ── Price header ─────────────────────────────────────────────────── */}
      <div className="px-5 pt-5 pb-4">
        <div className="flex items-start justify-between gap-6 flex-wrap">

          {/* Left: price block(s) + change row */}
          <div className="min-w-0">
            {showDual ? (
              <div className="flex flex-wrap items-stretch gap-x-8 gap-y-3">
                {/* Regular session close */}
                <div className="min-w-0">
                  <div className="text-[40px] font-bold tracking-tight text-foreground tabular-nums leading-none">
                    {fmtPrice(closePrice)}
                  </div>
                  <div className={cn(
                    'text-sm font-medium tabular-nums mt-2',
                    closeIsPos ? 'text-emerald-400' : 'text-red-400'
                  )}>
                    {closeIsPos ? '+' : ''}{fmtPrice(closeChange)} ({closeIsPos ? '+' : ''}{closePct.toFixed(2)}%)
                  </div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground/60 mt-1.5 font-semibold">
                    At Close
                  </div>
                </div>

                {/* Vertical divider */}
                <div className="w-px self-stretch bg-border/50" />

                {/* Pre-market or after-hours, live-updating */}
                <div className="min-w-0">
                  <div className="text-[40px] font-bold tracking-tight text-foreground tabular-nums leading-none">
                    {fmtPrice(extPriceVal)}
                  </div>
                  <div className={cn(
                    'text-sm font-medium tabular-nums mt-2',
                    extIsPos ? 'text-emerald-400' : 'text-red-400'
                  )}>
                    {extIsPos ? '+' : ''}{fmtPrice(extDiff)} ({extIsPos ? '+' : ''}{extPct.toFixed(2)}%)
                  </div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    {isLive && (
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    )}
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">
                      {extHours!.pre_or_post === 'pre' ? 'Pre-Market' : 'After-Hours'}
                    </span>
                  </div>
                </div>

              </div>
            ) : (
              <>
                <div className="text-[52px] font-bold tracking-tight text-foreground tabular-nums leading-none">
                  {fmtPrice(price)}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5">
                  <span className={cn('text-sm font-medium tabular-nums', priceColor)}>
                    {isPositive ? '+' : ''}{fmtPrice(change)} ({isPositive ? '+' : ''}{changePct.toFixed(2)}%) today
                  </span>

                  {isLive && (
                    <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Live
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Right: performance banner + range tabs + indicators */}
          <div className="flex flex-col items-end gap-2 shrink-0 pt-1">

            {/* Period performance — shown above the tabs for any range */}
            {hasChart && (
              <div className={cn('text-right tabular-nums', perfIsPos ? 'text-emerald-400' : 'text-red-400')}>
                <span className="text-sm font-semibold">
                  {perfIsPos ? '+' : ''}{fmtPrice(perfDiff)}
                  {' '}
                  ({perfIsPos ? '+' : ''}{Math.abs(perfPct).toFixed(2)}%)
                </span>
                {' '}
                <span className="text-xs font-normal text-muted-foreground">{RANGE_LABEL[range]}</span>
              </div>
            )}

            {/* Range tabs + settings gear */}
            <div className="flex items-center gap-0.5">
              {RANGES.map((r) => (
                <button
                  key={r}
                  onClick={() => { setRange(r); if (r === '1D') setActiveIndicators(new Set()); }}
                  className={cn(
                    'rounded-md px-2.5 py-1 text-xs font-medium transition-all',
                    range === r
                      ? 'text-foreground font-semibold'
                      : 'text-muted-foreground/50 hover:text-muted-foreground'
                  )}
                >
                  {RANGE_DISPLAY[r]}
                </button>
              ))}
              <div className="ml-1 pl-1 border-l border-border/30">
                <ChartSettingsPanel
                  prefs={prefs}
                  setPref={setPref}
                  reset={resetPrefs}
                  onRangeChange={(r) => { setRange(r as Range); }}
                  onIndicatorsChange={(inds) => {
                    setActiveIndicators(new Set(inds as Indicator[]));
                  }}
                />
              </div>
            </div>

            {/* Indicators — advanced users, non-1D only */}
            {!isSimplified && range !== '1D' && (
              <div className="flex items-center gap-1 flex-wrap justify-end">
                {INDICATORS.map(({ key, label }) => (
                  <button
                    key={key}
                    onClick={() => toggleIndicator(key)}
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px] font-medium transition-all border',
                      activeIndicators.has(key)
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-transparent text-muted-foreground border-border hover:text-foreground hover:border-foreground/30'
                    )}
                  >
                    {label}
                  </button>
                ))}
                {activeIndicators.size > 0 && (
                  <button
                    onClick={() => setActiveIndicators(new Set())}
                    className="rounded-full px-2 py-0.5 text-[10px] font-medium border border-border text-muted-foreground hover:text-foreground transition-all"
                  >
                    ✕
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Price chart ──────────────────────────────────────────────────── */}
      <div className="relative">
        {isLoadingChart && <Skeleton className="h-[300px] w-full" />}

        {!candleLoading && candleData?.candles === null && (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            No chart data available
          </div>
        )}

        {hasChart && (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={chartDisplayData} margin={{ top: 8, right: 0, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={lineColor} stopOpacity={prefs.chartStyle === 'area' ? 0.25 : 0} />
                  <stop offset="55%"  stopColor={lineColor} stopOpacity={prefs.chartStyle === 'area' ? 0.06 : 0} />
                  <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                </linearGradient>
              </defs>

              <YAxis
                domain={[Math.max(0.01, priceMin - yPad), priceMax + yPad]}
                scale={prefs.priceScale === 'log' ? 'log' : 'auto'}
                hide
              />

              <XAxis
                dataKey="time"
                type="number"
                scale="time"
                domain={['dataMin', 'dataMax']}
                tickCount={5}
                tickFormatter={(ts: number) => fmtLabel(ts, range)}
                tick={{ fill: textColor, fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                dy={6}
              />

              <Tooltip
                content={<ChartTooltip basePrice={chartBase} range={range} />}
                cursor={{ stroke: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.07)', strokeWidth: 1 }}
              />

              {range === '1D' && displayData[0]?.session !== undefined ? (
                <>
                  <Area
                    type="monotone"
                    dataKey="extPrice"
                    stroke="#6b7280"
                    strokeWidth={1.5}
                    strokeDasharray="4 3"
                    strokeOpacity={0.55}
                    fill="none"
                    dot={false}
                    activeDot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="regularPrice"
                    stroke={lineColor}
                    strokeWidth={2}
                    fill={`url(#${gradientId})`}
                    dot={false}
                    activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  {sessionBoundaries.openTime && (
                    <ReferenceLine
                      x={sessionBoundaries.openTime}
                      stroke="#6b7280"
                      strokeOpacity={0.2}
                      strokeDasharray="2 4"
                      strokeWidth={1}
                      label={{ value: 'Open', position: 'insideTopRight', fontSize: 9, fill: '#9ca3af', dy: 2 }}
                    />
                  )}
                  {sessionBoundaries.closeTime && (
                    <ReferenceLine
                      x={sessionBoundaries.closeTime}
                      stroke="#6b7280"
                      strokeOpacity={0.2}
                      strokeDasharray="2 4"
                      strokeWidth={1}
                      label={{ value: 'Close', position: 'insideTopRight', fontSize: 9, fill: '#9ca3af', dy: 2 }}
                    />
                  )}
                </>
              ) : (
                <Area
                  type="monotone"
                  dataKey="price"
                  stroke={lineColor}
                  strokeWidth={2}
                  fill={`url(#${gradientId})`}
                  dot={false}
                  activeDot={{ r: 4, fill: lineColor, strokeWidth: 0 }}
                  isAnimationActive={false}
                />
              )}

              {/* Period open / prev-close reference line */}
              {prefs.showPrevClose && chartBase > 0 && (
                <ReferenceLine
                  y={chartBase}
                  stroke={isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)'}
                  strokeDasharray="4 4"
                  strokeWidth={1}
                />
              )}

              {/* Earnings event markers */}
              {earningsMarkers.map(({ ts, beat }) => (
                <ReferenceLine
                  key={ts}
                  x={ts}
                  stroke={beat === null ? '#f59e0b' : beat ? '#22c55e' : '#ef4444'}
                  strokeOpacity={0.55}
                  strokeDasharray="3 4"
                  strokeWidth={1.5}
                  label={{
                    value: 'E',
                    position: 'insideTopLeft',
                    fontSize: 8,
                    fill: beat === null ? '#f59e0b' : beat ? '#22c55e' : '#ef4444',
                    dy: 4,
                  }}
                />
              ))}

              {/* Live dot at trailing edge */}
              {range === '1D' && isLive && chartDisplayData.length > 0 && (
                <ReferenceDot
                  x={chartDisplayData[chartDisplayData.length - 1].time}
                  y={chartDisplayData[chartDisplayData.length - 1].price}
                  r={5}
                  fill={lineColor}
                  stroke={`${lineColor}55`}
                  strokeWidth={5}
                />
              )}

              {(activeIndicators.has('sma50') || activeIndicators.has('sma200')) && (
                <Line type="monotone" dataKey="sma" stroke="#f59e0b" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              )}
              {activeIndicators.has('ema20') && (
                <Line type="monotone" dataKey="ema" stroke="#a78bfa" strokeWidth={1.5} dot={false} isAnimationActive={false} />
              )}
              {activeIndicators.has('bbands') && (
                <>
                  <Line type="monotone" dataKey="upper"  stroke="#60a5fa" strokeWidth={1} dot={false} strokeDasharray="4 2" isAnimationActive={false} />
                  <Line type="monotone" dataKey="middle" stroke="#60a5fa" strokeWidth={1} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="lower"  stroke="#60a5fa" strokeWidth={1} dot={false} strokeDasharray="4 2" isAnimationActive={false} />
                </>
              )}
            </AreaChart>
          </ResponsiveContainer>
        )}

        {/* Floating period high/low labels */}
        {hasChart && priceMax > 0 && (
          <div className="pointer-events-none absolute inset-x-3 top-2 flex items-center justify-end gap-1">
            <span className="text-[9px] text-muted-foreground/30 font-medium uppercase tracking-wider">H</span>
            <span className="text-[10px] tabular-nums text-muted-foreground/40 font-medium">{fmtPrice(priceMax)}</span>
          </div>
        )}
        {hasChart && priceMin > 0 && (
          <div className="pointer-events-none absolute inset-x-3 bottom-6 flex items-center justify-end gap-1">
            <span className="text-[9px] text-muted-foreground/30 font-medium uppercase tracking-wider">L</span>
            <span className="text-[10px] tabular-nums text-muted-foreground/40 font-medium">{fmtPrice(priceMin)}</span>
          </div>
        )}
      </div>

      {/* ── Volume bars ──────────────────────────────────────────────────── */}
      {prefs.showVolume && hasChart && (
        <div className="border-t border-border/30">
          <div className="px-5 pt-2 pb-0.5">
            <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-widest">
              Volume
            </span>
          </div>
          <ResponsiveContainer width="100%" height={58}>
            <BarChart data={chartDisplayData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <XAxis dataKey="time" type="number" scale="time" domain={['dataMin', 'dataMax']} hide />
              <YAxis hide />
              <Bar dataKey="volume" isAnimationActive={false} maxBarSize={6}>
                {chartDisplayData.map((entry, i) => (
                  <Cell
                    key={`vol-${entry.time}`}
                    fill={i === 0 || entry.price >= chartDisplayData[i - 1].price ? '#22c55e' : '#ef4444'}
                    fillOpacity={0.5}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── Oscillator panels (RSI / MACD) ───────────────────────────────── */}
      {showOscillator && (
        <div className="border-t border-border/30 mt-1">
          {activeOscillators.map((osc) => (
            <div key={osc}>
              <div className="px-5 pt-2 pb-1">
                <span className="text-[10px] text-muted-foreground/60 font-medium uppercase tracking-widest">
                  {osc.toUpperCase()}
                </span>
              </div>
              {osc === 'rsi' && (
                <ResponsiveContainer width="100%" height={90}>
                  <LineChart data={chartDisplayData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                    <XAxis dataKey="time" type="number" scale="time" domain={['dataMin', 'dataMax']} hide />
                    <YAxis domain={[0, 100]} hide ticks={[30, 50, 70]} />
                    <Tooltip formatter={(v: number) => v?.toFixed(1)} labelFormatter={() => ''} contentStyle={{ fontSize: 10 }} />
                    <ReferenceLine y={70} stroke="#ef4444" strokeOpacity={0.3} strokeDasharray="3 3" strokeWidth={1} />
                    <ReferenceLine y={30} stroke="#22c55e" strokeOpacity={0.3} strokeDasharray="3 3" strokeWidth={1} />
                    <ReferenceLine y={50} stroke={textColor} strokeDasharray="2 4" strokeWidth={1} />
                    <Line type="monotone" dataKey="rsi" stroke="#f59e0b" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
              {osc === 'macd' && (
                <ResponsiveContainer width="100%" height={90}>
                  <LineChart data={chartDisplayData} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
                    <XAxis dataKey="time" type="number" scale="time" domain={['dataMin', 'dataMax']} hide />
                    <YAxis hide tickFormatter={(v) => v?.toFixed(1)} />
                    <Tooltip formatter={(v: number) => v?.toFixed(3)} labelFormatter={() => ''} contentStyle={{ fontSize: 10 }} />
                    <ReferenceLine y={0} stroke={textColor} strokeDasharray="2 4" strokeWidth={1} />
                    <Line type="monotone" dataKey="macd"   stroke="#60a5fa" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                    <Line type="monotone" dataKey="signal" stroke="#f59e0b" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Stats bar ────────────────────────────────────────────────────── */}
      {(openPrice > 0 || dayHigh > 0 || dayLow > 0 || prevClose > 0) && (
        <div className="px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-border/20">
          {openPrice > 0  && <StatItem label="Open"       value={fmtPrice(openPrice)} />}
          {dayHigh > 0    && <StatItem label="High"       value={fmtPrice(dayHigh)}   valueClass="text-emerald-400" />}
          {dayLow > 0     && <StatItem label="Low"        value={fmtPrice(dayLow)}    valueClass="text-red-400" />}
          {prevClose > 0  && <StatItem label="Prev Close" value={fmtPrice(prevClose)} />}
        </div>
      )}
    </div>
  );
}
