'use client';

import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import dynamic from 'next/dynamic';
import { Maximize2, Sparkles, X } from 'lucide-react';

import { useQuery } from '@tanstack/react-query';
import { LineChart, Line } from '@/components/charts/line-chart';
import { Area } from '@/components/charts/area';
import { SessionLine, type SessionRegion } from '@/components/charts/session-line';
import { BarChart } from '@/components/charts/bar-chart';
import { Bar } from '@/components/charts/bar';
import { ReferenceLine } from '@/components/charts/reference-line';
import { EarningsMarker } from '@/components/charts/earnings-marker';
import { TransactionMarker } from '@/components/charts/transaction-marker';
import { Grid } from '@/components/charts/grid';
import { XAxis } from '@/components/charts/x-axis';
import { ChartTooltip } from '@/components/charts/tooltip';
import { useChartPrefs, type AdvancedChartType } from '@/hooks/use-chart-prefs';
import { getIndicatorDef, defaultParamsFor, INDICATOR_PALETTE, INDICATOR_PRESETS, type IndicatorInstance } from '@/lib/finance/indicators';
import { ChartSettingsPanel } from './ChartSettingsPanel';
import { AiPaywallDialog } from '@/components/billing/AiPaywallDialog';
import { useWhyTodayGate } from '@/hooks/use-why-today-gate';
import { Skeleton } from '@/components/ui/skeleton';
import { useLivePrices } from '@/hooks/use-live-prices';
import { useStockQuote } from '@/hooks/use-stock-price';
import { useExperienceLevel } from '@/hooks/use-experience-level';
import { useHoldings, useHoldingSales, useHoldingPurchases } from '@/hooks/use-holdings';
import { buildTransactionMarkers } from '@/lib/holdings/transaction-markers';
import { cn } from '@/lib/utils';
import type { ExtendedHoursQuote, IndicatorValue, CompanyEarnings } from '@/lib/twelvedata/twelvedata-client';

// Fullscreen advanced chart is loaded on demand so lightweight-charts stays out
// of the main bundle (only advanced users who click Expand pay for it). This
// is a separate system entirely — untouched by the Bklit UI swap below.
const AdvancedChartModal = dynamic(
  () => import('./advanced-chart/AdvancedChartModal').then((m) => m.AdvancedChartModal),
  { ssr: false }
);

// ─── Types ────────────────────────────────────────────────────────────────────

type Range = '1D' | '1W' | '1M' | '6M' | '1Y' | 'YTD' | '5Y' | 'MAX';
const RANGES: Range[] = ['1D', '1W', '1M', '6M', 'YTD', '1Y', '5Y', 'MAX'];

// Live tick is only appended if the gap since the last candle is under this —
// otherwise a weekend/holiday close would stretch the chart's time domain
// across the whole closed period for a single meaningless dot.
const MAX_LIVE_TICK_GAP_SECONDS = 16 * 60 * 60;
// Ranges spanning a year or more — the tooltip needs a year to disambiguate.
const YEAR_DISAMBIGUATED_RANGES = new Set<Range>(['1Y', '5Y', 'MAX']);

// Display labels shown on buttons
const RANGE_DISPLAY: Record<Range, string> = {
  '1D': '1D', '1W': '5D', '1M': '1M', '6M': '6M', '1Y': '1Y', 'YTD': 'YTD', '5Y': '5Y', 'MAX': 'ALL',
};
// Human-readable label used in the performance banner
const RANGE_LABEL_KEYS: Record<Range, string> = {
  '1D': 'stockPricePanelRangeLabelToday', '1W': 'stockPricePanelRangeLabelWeek', '1M': 'stockPricePanelRangeLabelMonth',
  '6M': 'stockPricePanelRangeLabel6Months', '1Y': 'stockPricePanelRangeLabelYear', 'YTD': 'stockPricePanelRangeLabelYtd',
  '5Y': 'stockPricePanelRangeLabel5Years', 'MAX': 'stockPricePanelRangeLabelAll',
};
function getRangeLabel(t: TFunction): Record<Range, string> {
  return Object.fromEntries(
    Object.entries(RANGE_LABEL_KEYS).map(([range, key]) => [range, t(key)])
  ) as Record<Range, string>;
}

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

// Overlay lines render on the main chart; oscillators get their own sub-panel below volume.
const OSCILLATOR_INDICATORS = new Set<Indicator>(['rsi', 'macd']);

interface CandleData { t: number[]; c: number[]; o: number[]; h: number[]; l: number[]; v: number[]; session?: Array<'pre' | 'regular' | 'post'> }
interface ChartPoint {
  time: number; price: number; volume: number;
  session?: 'pre' | 'regular' | 'post';
  sma50?: number; sma200?: number; ema?: number; upper?: number; middle?: number; lower?: number;
  rsi?: number; macd?: number; signal?: number;
}

// Canonical per-indicator line colors — shared by the chart lines, the toggle
// legend, and the hover tooltip so a color always means the same indicator.
const INDICATOR_COLORS: Record<Indicator, string> = {
  sma50: '#f59e0b', sma200: '#fb923c', ema20: '#a78bfa', bbands: '#60a5fa',
  rsi: '#f59e0b', macd: '#60a5fa',
};

interface IndicatorResponse {
  success: boolean;
  data?: IndicatorValue[];
  error?: string;
}

function fetchIndicator(ticker: string, opt: IndicatorOption, range: Range): Promise<IndicatorResponse> {
  const params = new URLSearchParams({ type: opt.type, range });
  if (opt.params) {
    for (const [k, v] of Object.entries(opt.params)) params.set(k, String(v));
  }
  return fetch(`/api/stock/${ticker}/indicator?${params}`).then((r) => r.json());
}

/** Ranges whose candles are session-tagged (pre/regular/post) — 1D always, 1W via the extended-hours 15-min bars. */
function hasSessionSplit(range: Range): boolean {
  return range === '1D' || range === '1W';
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

// ─── Stat item (bottom bar) ───────────────────────────────────────────────────

function StatItem({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground/85 shrink-0">{label}</span>
      <span className={cn('text-xs font-medium tabular-nums text-foreground truncate', valueClass)}>{value}</span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StockPricePanel({ ticker }: { ticker: string }) {
  const { t } = useTranslation('stock');
  const RANGE_LABEL = getRangeLabel(t);
  const { prefs, setPref, setPrefs, reset: resetPrefs } = useChartPrefs();
  const [range, setRange] = useState<Range>(prefs.defaultRange as Range);

  const [activeIndicators, setActiveIndicators] = useState<Set<Indicator>>(
    new Set(prefs.defaultIndicators as Indicator[])
  );
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const { isSimplified } = useExperienceLevel();
  const { requestWhyToday, paywallOpen, setPaywallOpen, paywallQuota } = useWhyTodayGate();

  function toggleIndicator(key: Indicator) {
    setActiveIndicators((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  // Advanced (fullscreen) chart prefs — single source of truth lives here so the
  // experience persists across open/close within a session, then to localStorage/Supabase.
  const advIndicators = prefs.advancedIndicators;
  const addAdvIndicator = (type: string) => {
    const def = getIndicatorDef(type);
    if (!def) return;
    const used = new Set(advIndicators.map((i) => i.color));
    const color = INDICATOR_PALETTE.find((c) => !used.has(c)) ?? INDICATOR_PALETTE[advIndicators.length % INDICATOR_PALETTE.length];
    const inst: IndicatorInstance = { id: `${type}-${Date.now()}`, type, params: defaultParamsFor(def), color };
    setPref('advancedIndicators', [...advIndicators, inst]);
  };
  const removeAdvIndicator = (id: string) =>
    setPref('advancedIndicators', advIndicators.filter((i) => i.id !== id));
  const updateAdvIndicator = (id: string, params: Record<string, number>) =>
    setPref('advancedIndicators', advIndicators.map((i) => (i.id === id ? { ...i, params } : i)));
  const applyAdvPreset = (presetId: string) => {
    const preset = INDICATOR_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    const insts = preset.items
      .map((item, i) => {
        const def = getIndicatorDef(item.type);
        if (!def) return null;
        return {
          id: `${item.type}-${Date.now()}-${i}`,
          type: item.type,
          params: { ...defaultParamsFor(def), ...(item.params ?? {}) },
          color: INDICATOR_PALETTE[i % INDICATOR_PALETTE.length],
        } as IndicatorInstance;
      })
      .filter((x): x is IndicatorInstance => x != null);
    setPref('advancedIndicators', insts);
  };
  const replaceAdvIndicators = (insts: IndicatorInstance[]) =>
    setPref('advancedIndicators', insts);
  // Apply a user preset's chart config atomically (one settings write).
  const applyAdvConfig = (c: {
    chartType: AdvancedChartType;
    indicators: IndicatorInstance[];
    showVolume: boolean;
    showEvents: boolean;
    showTransactions: boolean;
  }) =>
    setPrefs({
      advancedChartType: c.chartType,
      advancedIndicators: c.indicators,
      showVolume: c.showVolume,
      showEarnings: c.showEvents,
      showTransactions: c.showTransactions,
    });

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
  const { data: candleData, isLoading: candleLoading, isFetching, isError: candleError } = useQuery<{
    success: boolean; candles: CandleData | null; range: Range;
  }>({
    queryKey: ['stock-candles', ticker, range],
    queryFn: async () => {
      const res = await fetch(`/api/stock/${ticker}/candles?range=${range}`);
      // Query functions must throw on failure — otherwise react-query treats a
      // 500's error body (which has no `candles` key) as a successful, empty
      // result and the chart silently renders nothing instead of an error state.
      if (!res.ok) throw new Error(`Failed to fetch candles (${res.status})`);
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

  // ── This user's trades on this ticker (for the buy/sell overlay) ─────────
  // Cheap Supabase reads (no TwelveData cost) shared across the app via the
  // same queryKey, so this is fetched unconditionally rather than gated
  // behind the toggle — flipping the switch on shows markers instantly.
  const { data: allHoldings } = useHoldings();
  const { data: allSales } = useHoldingSales();
  const { data: allPurchases } = useHoldingPurchases();
  const myHolding = allHoldings?.find((h) => h.symbol.toUpperCase() === ticker.toUpperCase());
  const mySales = useMemo(
    () => allSales?.filter((s) => s.symbol.toUpperCase() === ticker.toUpperCase()) ?? [],
    [allSales, ticker]
  );
  const myPurchases = useMemo(
    () => allPurchases?.filter((p) => p.symbol.toUpperCase() === ticker.toUpperCase()) ?? [],
    [allPurchases, ticker]
  );

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
    const pts: ChartPoint[] = t.map((ts, i) => ({ time: ts, price: c[i], volume: v[i], session: session?.[i] }));

    function applyIndicator(values: IndicatorValue[], key: Indicator) {
      const map = new Map<string, IndicatorValue>();
      for (const iv of values) map.set(iv.datetime.slice(0, 10), iv);
      for (const pt of pts) {
        const iv = map.get(new Date(pt.time * 1000).toISOString().slice(0, 10));
        if (!iv) continue;
        if (key === 'sma50') pt.sma50 = iv.sma as number;
        if (key === 'sma200') pt.sma200 = iv.sma as number;
        if (key === 'ema20') pt.ema = iv.ema as number;
        if (key === 'bbands') { pt.upper = iv.upper_band as number; pt.middle = iv.middle_band as number; pt.lower = iv.lower_band as number; }
        if (key === 'rsi') pt.rsi = iv.rsi as number;
        if (key === 'macd') { pt.macd = iv.macd as number; pt.signal = iv.macd_signal as number; }
      }
    }

    if (sma50Data?.length)  applyIndicator(sma50Data,  'sma50');
    if (sma200Data?.length) applyIndicator(sma200Data, 'sma200');
    if (ema20Data?.length)  applyIndicator(ema20Data,  'ema20');
    if (bbandsData?.length) applyIndicator(bbandsData, 'bbands');
    if (rsiData?.length)    applyIndicator(rsiData,    'rsi');
    if (macdData?.length)   applyIndicator(macdData,   'macd');

    return pts;
  }, [candleData, sma50Data, sma200Data, ema20Data, bbandsData, rsiData, macdData]);

  // Append live tick so the chart always ends at current price — 1D, and also
  // 1W/1M (5D/1M use intraday bars too, so without this the line stops at the
  // last fetched candle instead of reaching today's live pre/post-market price).
  // Capped to a same-day-ish gap (MAX_LIVE_TICK_GAP_SECONDS): without this, a
  // weekend/holiday close would still get a point stamped at the real "now",
  // stretching the chart's time domain across the whole closed period and
  // squeezing every real trading day into a fraction of the width for a
  // single meaningless dot.
  const isIntradayRange = range === '1D' || range === '1W' || range === '1M';
  const displayData = useMemo<ChartPoint[]>(() => {
    if (!isIntradayRange || !isLive || !live || !chartData.length) return chartData;
    // eslint-disable-next-line react-hooks/purity
    const nowSec = Math.floor(Date.now() / 1000);
    const last = chartData[chartData.length - 1];
    const gap = nowSec - last.time;
    if (Math.abs(gap) < 120 || gap > MAX_LIVE_TICK_GAP_SECONDS) return chartData;

    const etTimeStr = new Date().toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour12: false });
    const [etHStr, etMStr] = etTimeStr.split(':');
    const etMins = parseInt(etHStr) * 60 + parseInt(etMStr);
    const liveSession: 'pre' | 'regular' | 'post' = etMins < 570 ? 'pre' : etMins >= 960 ? 'post' : 'regular';

    return [...chartData, { time: nowSec, price: live.price, volume: 0, session: liveSession }];
  }, [chartData, isIntradayRange, isLive, live]);

  // Strip pre/post candles when extended hours are hidden.
  const chartDisplayData = useMemo(() => {
    if (range !== '1D' || prefs.showExtendedHours) return displayData;
    return displayData.some((d) => d.session !== undefined)
      ? displayData.filter((d) => !d.session || d.session === 'regular')
      : displayData;
  }, [displayData, range, prefs.showExtendedHours]);

  const bklitData = useMemo(
    () => chartDisplayData.map((pt, i) => ({
      date: new Date(pt.time * 1000),
      price: pt.price,
      volume: pt.volume,
      session: pt.session,
      isUp: i === 0 || pt.price >= chartDisplayData[i - 1].price,
      sma50: pt.sma50, sma200: pt.sma200, ema: pt.ema,
      upper: pt.upper, middle: pt.middle, lower: pt.lower,
      rsi: pt.rsi, macd: pt.macd, signal: pt.signal,
    })),
    [chartDisplayData]
  );

  // Session regions for SessionLine — consecutive same-session index runs.
  // Multi-day ranges (1W's 15-min bars) repeat pre→regular→post once per
  // day, so this is N regions, not just one pre/regular/post cycle. Empty
  // when extended hours are hidden (chartDisplayData already filters
  // pre/post out above) or the range doesn't carry session tags at all.
  const sessionRegions = useMemo<SessionRegion[]>(() => {
    if (!hasSessionSplit(range)) return [];
    const regions: SessionRegion[] = [];
    chartDisplayData.forEach((pt, i) => {
      if (!pt.session) return;
      const current = regions[regions.length - 1];
      if (current && current.session === pt.session) {
        current.endIndex = i;
      } else {
        regions.push({ startIndex: i, endIndex: i, session: pt.session });
      }
    });
    return regions;
  }, [chartDisplayData, range]);


  // Earnings markers — filtered to dates visible in the current chart window.
  const earningsMarkers = useMemo<Array<{ date: Date; beat: boolean | null }>>(() => {
    if (!prefs.showEarnings || !earningsResp?.earnings?.length || !chartDisplayData.length) return [];
    const chartStart = chartDisplayData[0].time;
    const chartEnd   = chartDisplayData[chartDisplayData.length - 1].time;
    return earningsResp.earnings
      .map((e) => {
        const ts = Math.floor(new Date(`${e.period}T12:00:00Z`).getTime() / 1000);
        const beat = e.actual != null && e.estimate != null ? e.actual >= e.estimate : null;
        return { ts, beat };
      })
      .filter(({ ts }) => ts >= chartStart && ts <= chartEnd)
      .map(({ ts, beat }) => ({ date: new Date(ts * 1000), beat }));
  }, [prefs.showEarnings, earningsResp, chartDisplayData]);

  // Buy/sell markers — filtered to dates visible in the current chart window,
  // same shape as the earnings markers above.
  const transactionMarkers = useMemo(() => {
    if (!prefs.showTransactions || !chartDisplayData.length) return [];
    const chartStart = chartDisplayData[0].time;
    const chartEnd = chartDisplayData[chartDisplayData.length - 1].time;
    return buildTransactionMarkers(myHolding, mySales, myPurchases)
      .filter((m) => m.tsSeconds >= chartStart && m.tsSeconds <= chartEnd)
      .map((m) => ({
        date: new Date(m.tsSeconds * 1000),
        price: m.price,
        kind: m.kind,
        title:
          m.kind === 'buy'
            ? myPurchases.length > 0
              ? t('stockPricePanelMarkerBought', { price: fmtPrice(m.price), date: m.dateStr })
              : t('stockPricePanelMarkerBoughtAvg', { price: fmtPrice(m.price), date: m.dateStr })
            : t('stockPricePanelMarkerSold', { quantity: m.quantity, price: fmtPrice(m.price), date: m.dateStr }),
      }));
  }, [prefs.showTransactions, myHolding, mySales, myPurchases, chartDisplayData, t]);

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
  const showArea   = prefs.chartStyle === 'area';

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
              <div className="flex flex-wrap items-stretch gap-x-4 gap-y-3 sm:gap-x-8">
                {/* Regular session close */}
                <div className="min-w-0">
                  <div className="text-[32px] sm:text-[40px] font-bold tracking-tight text-foreground tabular-nums leading-none">
                    {fmtPrice(closePrice)}
                  </div>
                  <div className={cn(
                    'text-sm font-medium tabular-nums mt-2',
                    closeIsPos ? 'text-emerald-400' : 'text-red-400'
                  )}>
                    {closeIsPos ? '+' : ''}{fmtPrice(closeChange)} ({closeIsPos ? '+' : ''}{closePct.toFixed(2)}%)
                  </div>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[11px] uppercase tracking-widest text-muted-foreground/80 font-semibold">
                      {t('stockPricePanelAtClose')}
                    </span>
                    <button
                      type="button"
                      onClick={() => requestWhyToday({ ticker, price, change, changePct })}
                      className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/30"
                    >
                      <Sparkles className="h-3 w-3" />
                      {t('stockPricePanelWhyButton')}
                    </button>
                  </div>
                </div>

                {/* Vertical divider */}
                <div className="w-px self-stretch bg-border/50" />

                {/* Pre-market or after-hours, live-updating */}
                <div className="min-w-0">
                  <div className="text-[32px] sm:text-[40px] font-bold tracking-tight text-foreground tabular-nums leading-none">
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
                    <span className="text-[11px] uppercase tracking-widest text-muted-foreground/80 font-semibold">
                      {extHours!.pre_or_post === 'pre' ? t('stockPricePanelPreMarket') : t('stockPricePanelAfterHours')}
                    </span>
                  </div>
                </div>

              </div>
            ) : (
              <>
                <div className="text-[40px] sm:text-[52px] font-bold tracking-tight text-foreground tabular-nums leading-none">
                  {fmtPrice(price)}
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-2.5">
                  <span className={cn('text-sm font-medium tabular-nums', priceColor)}>
                    {isPositive ? '+' : ''}{fmtPrice(change)} ({isPositive ? '+' : ''}{changePct.toFixed(2)}%) {RANGE_LABEL['1D']}
                  </span>

                  {range === '1D' && (
                    <button
                      type="button"
                      onClick={() => requestWhyToday({ ticker, price, change, changePct })}
                      className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/30"
                    >
                      <Sparkles className="h-3 w-3" />
                      {t('stockPricePanelWhyButton')}
                    </button>
                  )}

                  {isLive && (
                    <span className="flex items-center gap-1 text-xs text-emerald-400 font-medium">
                      <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      {t('stockPricePanelLive')}
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
                      : 'text-muted-foreground/85 hover:text-muted-foreground'
                  )}
                >
                  {RANGE_DISPLAY[r]}
                </button>
              ))}
              <div className="ml-1 pl-1 border-l border-border/30 flex items-center gap-0.5">
                <ChartSettingsPanel
                  prefs={prefs}
                  setPref={setPref}
                  reset={resetPrefs}
                  onRangeChange={(r) => { setRange(r as Range); }}
                  onIndicatorsChange={(inds) => {
                    setActiveIndicators(new Set(inds as Indicator[]));
                  }}
                />
                {!isSimplified && (
                  <button
                    type="button"
                    onClick={() => setAdvancedOpen(true)}
                    title={t('stockPricePanelAdvancedChartTitle')}
                    aria-label={t('stockPricePanelAdvancedChartAriaLabel')}
                    className="rounded-md p-1.5 text-muted-foreground/80 hover:text-foreground hover:bg-muted/60 transition-colors"
                  >
                    <Maximize2 className="h-3.5 w-3.5" />
                  </button>
                )}
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
                      'rounded-full px-2 py-0.5 text-[11px] font-medium transition-all border',
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
                    aria-label={t('stockPricePanelClearIndicators')}
                    className="rounded-full p-1 border border-border text-muted-foreground hover:text-foreground transition-all"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Price chart (Bklit UI) ───────────────────────────────────────── */}
      <div className="relative">
        {isLoadingChart && <Skeleton className="h-[300px] w-full" />}

        {!isLoadingChart && candleError && (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            {t('stockPricePanelLoadError')}
          </div>
        )}

        {!isLoadingChart && !candleError && candleData?.candles === null && (
          <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
            {t('advancedChartNoData')}
          </div>
        )}

        {hasChart && (
          <LineChart data={bklitData} margin={{ top: 16, right: 28, bottom: 32, left: 28 }} style={{ height: 300 }} zeroBaseline={false}>
            <Grid horizontal />
            {sessionRegions.length > 0 ? (
              <SessionLine
                dataKey="price"
                regularStroke={lineColor}
                regions={sessionRegions}
                showArea={showArea}
              />
            ) : (
              <Area
                dataKey="price"
                stroke={lineColor}
                fill={lineColor}
                fillOpacity={showArea ? 0.25 : 0}
                showMarkers={false}
              />
            )}
            {activeIndicators.has('sma50') && (
              <Line dataKey="sma50" stroke={INDICATOR_COLORS.sma50} strokeWidth={1.5} showMarkers={false} />
            )}
            {activeIndicators.has('sma200') && (
              <Line dataKey="sma200" stroke={INDICATOR_COLORS.sma200} strokeWidth={1.5} showMarkers={false} />
            )}
            {activeIndicators.has('ema20') && (
              <Line dataKey="ema" stroke={INDICATOR_COLORS.ema20} strokeWidth={1.5} showMarkers={false} />
            )}
            {activeIndicators.has('bbands') && (
              <>
                <Line dataKey="upper" stroke={INDICATOR_COLORS.bbands} strokeWidth={1} dashArray="4,2" showMarkers={false} />
                <Line dataKey="middle" stroke={INDICATOR_COLORS.bbands} strokeWidth={1} showMarkers={false} />
                <Line dataKey="lower" stroke={INDICATOR_COLORS.bbands} strokeWidth={1} dashArray="4,2" showMarkers={false} />
              </>
            )}
            {prefs.showPrevClose && chartBase > 0 && (
              <ReferenceLine y={chartBase} strokeDasharray="4,4" />
            )}
            {earningsMarkers.map(({ date, beat }) => (
              <EarningsMarker
                key={date.getTime()}
                date={date}
                stroke={beat === null ? '#f59e0b' : beat ? '#22c55e' : '#ef4444'}
              />
            ))}
            {transactionMarkers.map((m) => (
              <TransactionMarker key={`${m.kind}-${m.date.getTime()}`} date={m.date} price={m.price} kind={m.kind} title={m.title} />
            ))}
            <ChartTooltip
              showTime={isIntradayRange}
              showYear={YEAR_DISAMBIGUATED_RANGES.has(range)}
              rows={(point) => {
                const rows = [{ label: t('advancedChartPriceLabel'), value: fmtPrice(point.price as number), color: lineColor }];
                if ((point.volume as number) > 0) rows.push({ label: t('stockPricePanelTooltipVol'), value: fmtVol(point.volume as number), color: 'var(--chart-grid)' });
                if (activeIndicators.has('sma50') && point.sma50 != null) rows.push({ label: 'SMA 50', value: fmtPrice(point.sma50 as number), color: INDICATOR_COLORS.sma50 });
                if (activeIndicators.has('sma200') && point.sma200 != null) rows.push({ label: 'SMA 200', value: fmtPrice(point.sma200 as number), color: INDICATOR_COLORS.sma200 });
                if (activeIndicators.has('ema20') && point.ema != null) rows.push({ label: 'EMA 20', value: fmtPrice(point.ema as number), color: INDICATOR_COLORS.ema20 });
                if (activeIndicators.has('bbands')) {
                  if (point.upper != null) rows.push({ label: 'BB Upper', value: fmtPrice(point.upper as number), color: INDICATOR_COLORS.bbands });
                  if (point.middle != null) rows.push({ label: 'BB Mid', value: fmtPrice(point.middle as number), color: INDICATOR_COLORS.bbands });
                  if (point.lower != null) rows.push({ label: 'BB Lower', value: fmtPrice(point.lower as number), color: INDICATOR_COLORS.bbands });
                }
                return rows;
              }}
            />
            <XAxis />
          </LineChart>
        )}
      </div>

      {/* ── Volume bars (Bklit UI) ───────────────────────────────────────── */}
      {prefs.showVolume && hasChart && (
        <div className="border-t border-border/30">
          <div className="px-5 pt-2 pb-0.5">
            <span className="text-[11px] text-muted-foreground/80 font-medium uppercase tracking-widest">
              {t('stockPricePanelVolumeLabel')}
            </span>
          </div>
          <BarChart data={bklitData} xDataKey="date" timeScale margin={{ top: 2, right: 28, bottom: 0, left: 28 }} style={{ height: 58 }}>
            <Bar
              dataKey="volume"
              fadedOpacity={0.5}
              fillAccessor={(d) => (d.isUp ? '#22c55e' : '#ef4444')}
            />
          </BarChart>
        </div>
      )}

      {/* ── Oscillator panels (RSI / MACD, Bklit UI) ─────────────────────── */}
      {showOscillator && (
        <div className="border-t border-border/30 mt-1">
          {activeOscillators.includes('rsi') && (
            <div>
              <div className="px-5 pt-2 pb-1">
                <span className="text-[11px] text-muted-foreground/80 font-medium uppercase tracking-widest">RSI</span>
              </div>
              <LineChart data={bklitData} margin={{ top: 4, right: 28, bottom: 0, left: 28 }} style={{ height: 90 }} fixedYDomain={[0, 100]}>
                <ReferenceLine y={70} stroke="#ef4444" strokeOpacity={0.3} strokeDasharray="3,3" />
                <ReferenceLine y={30} stroke="#22c55e" strokeOpacity={0.3} strokeDasharray="3,3" />
                <ReferenceLine y={50} strokeDasharray="2,4" />
                <Line dataKey="rsi" stroke={INDICATOR_COLORS.rsi} strokeWidth={1.5} showMarkers={false} />
                <ChartTooltip
                  showYear={YEAR_DISAMBIGUATED_RANGES.has(range)}
                  rows={(point) => point.rsi != null ? [{ label: 'RSI', value: (point.rsi as number).toFixed(1), color: INDICATOR_COLORS.rsi }] : []}
                />
              </LineChart>
            </div>
          )}
          {activeOscillators.includes('macd') && (
            <div>
              <div className="px-5 pt-2 pb-1">
                <span className="text-[11px] text-muted-foreground/80 font-medium uppercase tracking-widest">MACD</span>
              </div>
              <LineChart data={bklitData} margin={{ top: 4, right: 28, bottom: 0, left: 28 }} style={{ height: 90 }} zeroBaseline={false}>
                <ReferenceLine y={0} strokeDasharray="2,4" />
                <Line dataKey="macd" stroke="#60a5fa" strokeWidth={1.5} showMarkers={false} />
                <Line dataKey="signal" stroke="#f59e0b" strokeWidth={1.5} showMarkers={false} />
                <ChartTooltip
                  showYear={YEAR_DISAMBIGUATED_RANGES.has(range)}
                  rows={(point) => {
                    const rows: { label: string; value: string; color: string }[] = [];
                    if (point.macd != null) rows.push({ label: 'MACD', value: (point.macd as number).toFixed(3), color: '#60a5fa' });
                    if (point.signal != null) rows.push({ label: 'Signal', value: (point.signal as number).toFixed(3), color: '#f59e0b' });
                    return rows;
                  }}
                />
              </LineChart>
            </div>
          )}
        </div>
      )}

      {/* ── Stats bar ────────────────────────────────────────────────────── */}
      {(openPrice > 0 || dayHigh > 0 || dayLow > 0 || prevClose > 0) && (
        <div className="px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-1.5 border-t border-border/20">
          {openPrice > 0  && <StatItem label={t('stockPricePanelOpenLabel')}       value={fmtPrice(openPrice)} />}
          {dayHigh > 0    && <StatItem label={t('stockPricePanelHighLabel')}       value={fmtPrice(dayHigh)}   valueClass="text-emerald-400" />}
          {dayLow > 0     && <StatItem label={t('stockPricePanelLowLabel')}        value={fmtPrice(dayLow)}    valueClass="text-red-400" />}
          {prevClose > 0  && <StatItem label={t('stockPricePanelPrevCloseLabel')}  value={fmtPrice(prevClose)} />}
        </div>
      )}

      {advancedOpen && (
        <AdvancedChartModal
          ticker={ticker}
          initialRange={range}
          onClose={() => setAdvancedOpen(false)}
          chartType={prefs.advancedChartType}
          onChartType={(t) => setPref('advancedChartType', t)}
          indicators={advIndicators}
          onAddIndicator={addAdvIndicator}
          onRemoveIndicator={removeAdvIndicator}
          onUpdateIndicator={updateAdvIndicator}
          onApplyPreset={applyAdvPreset}
          onReplaceIndicators={replaceAdvIndicators}
          onApplyConfig={applyAdvConfig}
          showVolume={prefs.showVolume}
          onToggleVolume={() => setPref('showVolume', !prefs.showVolume)}
          showEvents={prefs.showEarnings}
          onToggleEvents={() => setPref('showEarnings', !prefs.showEarnings)}
          showTransactions={prefs.showTransactions}
          onToggleTransactions={() => setPref('showTransactions', !prefs.showTransactions)}
          holding={myHolding ? { date_purchased: myHolding.date_purchased, avg_price: myHolding.avg_price, quantity: myHolding.quantity } : undefined}
          sales={mySales}
          purchases={myPurchases}
        />
      )}

      <AiPaywallDialog
        open={paywallOpen}
        onOpenChange={setPaywallOpen}
        featureName="Why Today"
        quota={paywallQuota}
      />
    </div>
  );
}
