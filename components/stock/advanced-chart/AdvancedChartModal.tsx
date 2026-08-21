'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import { motion } from 'framer-motion';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { AdvancedChartType, ChartRange } from '@/hooks/use-chart-prefs';
import { useStockQuote } from '@/hooks/use-stock-price';
import { useLivePrices } from '@/hooks/use-live-prices';
import { useAlerts } from '@/hooks/use-alerts';
import type { CompanyEarnings } from '@/lib/twelvedata/twelvedata-client';
import {
  buildTransactionMarkers,
  type TransactionMarkerInput,
  type SaleMarkerInput,
  type PurchaseMarkerInput,
} from '@/lib/holdings/transaction-markers';
import {
  getIndicatorDef,
  defaultParamsFor,
  indicatorLabel,
  INDICATOR_PALETTE,
  type OHLCV,
  type IndicatorInstance,
} from '@/lib/finance/indicators';
import { AdvancedChart, type ChartTool } from './AdvancedChart';
import { ChartToolbar } from './ChartToolbar';
import { ChartAIPanel } from './ChartAIPanel';
import { buildChartSnapshot, type ChartAction } from './chart-context';
import { useChartPresets, type ChartPreset } from '@/hooks/use-chart-presets';

interface CandlesResponse {
  success: boolean;
  candles: OHLCV | null;
  error?: string;
}

const INTRADAY_RANGES = new Set<ChartRange>(['1D', '1W', '1M']);

// Approximate bars-per-calendar-day + the visible window per range — used to
// fetch enough warm-up history for long indicators (e.g. SMA 200) so they cover
// the whole visible window instead of starting partway in.
const RANGE_META: Record<ChartRange, { daysBack: number; barsPerDay: number }> = {
  '1D':  { daysBack: 1,        barsPerDay: 390 },
  '1W':  { daysBack: 7,        barsPerDay: 26 },
  '1M':  { daysBack: 31,       barsPerDay: 7 },
  '6M':  { daysBack: 183,      barsPerDay: 1 },
  '1Y':  { daysBack: 365,      barsPerDay: 1 },
  'YTD': { daysBack: 365,      barsPerDay: 1 },
  '5Y':  { daysBack: 365 * 5,  barsPerDay: 1 / 7 },
  'MAX': { daysBack: 365 * 20, barsPerDay: 1 / 7 },
};

interface Props {
  ticker: string;
  initialRange: ChartRange;
  onClose: () => void;
  chartType: AdvancedChartType;
  onChartType: (t: AdvancedChartType) => void;
  /** Optional — notified whenever the range changes, for callers that don't otherwise observe it (e.g. the Academy chart-tour lesson). Range itself stays modal-internal state. */
  onRangeChange?: (range: ChartRange) => void;
  indicators: IndicatorInstance[];
  onAddIndicator: (type: string) => void;
  onRemoveIndicator: (id: string) => void;
  onUpdateIndicator: (id: string, params: Record<string, number>) => void;
  onApplyPreset: (presetId: string) => void;
  /** Replace the whole indicator list (used by Clear and preset apply). */
  onReplaceIndicators: (insts: IndicatorInstance[]) => void;
  /** Apply several chart prefs atomically (used when applying a user preset). */
  onApplyConfig: (config: {
    chartType: AdvancedChartType;
    indicators: IndicatorInstance[];
    showVolume: boolean;
    showEvents: boolean;
    showTransactions: boolean;
  }) => void;
  showVolume: boolean;
  onToggleVolume: () => void;
  showEvents: boolean;
  onToggleEvents: () => void;
  showTransactions: boolean;
  onToggleTransactions: () => void;
  /** This user's holding/sales/purchases for `ticker`, already scoped by the caller. */
  holding?: TransactionMarkerInput;
  sales: SaleMarkerInput[];
  purchases?: PurchaseMarkerInput[];
}

export function AdvancedChartModal({
  ticker, initialRange, onClose,
  chartType, onChartType, onRangeChange, indicators, onAddIndicator, onRemoveIndicator, onUpdateIndicator, onApplyPreset,
  onReplaceIndicators, onApplyConfig,
  showVolume, onToggleVolume, showEvents, onToggleEvents, showTransactions, onToggleTransactions, holding, sales, purchases = [],
}: Props) {
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';
  const [range, setRange] = useState<ChartRange>(initialRange);
  const [tool, setTool] = useState<ChartTool>('none');
  const [aiOpen, setAiOpen] = useState(false);

  const handleSetRange = (r: ChartRange) => {
    setRange(r);
    onRangeChange?.(r);
  };

  const { presets, savePreset, deletePreset } = useChartPresets();
  const { create: createAlert } = useAlerts();

  const handleClearIndicators = () => onReplaceIndicators([]);
  const handleSavePreset = (name: string) =>
    savePreset({ name, range, chartType, indicators, showVolume, showEvents, showTransactions });
  const handleApplyPreset = (p: ChartPreset) => {
    handleSetRange(p.range);
    onApplyConfig({
      chartType: p.chartType,
      indicators: p.indicators,
      showVolume: p.showVolume,
      showEvents: p.showEvents,
      // Presets saved before this feature shipped won't have the field.
      showTransactions: p.showTransactions ?? false,
    });
  };

  const { data: quote } = useStockQuote(ticker);

  // Live ticks for the in-place last-bar update (1D only).
  const liveMap = useLivePrices([ticker]);
  const livePrice = range === '1D' ? liveMap.get(ticker)?.price : undefined;

  const handleCreateAlert = (price: number) => {
    const current = quote?.c ?? price;
    const type = price >= current ? 'price_above' : 'price_below';
    const params = new URLSearchParams({ symbol: ticker.toUpperCase(), price: price.toFixed(2), type });
    onClose();
    router.push(`/tools/alerts?${params.toString()}`);
  };

  // Longest indicator lookback in use → warm-up history to fetch behind the
  // visible window so long SMAs span the full timeframe (TradingView parity).
  const maxPeriod = useMemo(() => {
    let m = 0;
    for (const inst of indicators) {
      for (const v of Object.values(inst.params)) if (typeof v === 'number') m = Math.max(m, v);
    }
    return m;
  }, [indicators]);

  const padDays = useMemo(() => {
    if (range === '1D' || maxPeriod <= 0) return 0;
    return Math.min(4000, Math.ceil((maxPeriod / RANGE_META[range].barsPerDay) * 1.6));
  }, [range, maxPeriod]);

  const { data, isLoading, isError } = useQuery<CandlesResponse>({
    queryKey: ['stock-candles', ticker, range, padDays],
    queryFn: async () => {
      const url = `/api/stock/${ticker}/candles?range=${range}${padDays ? `&padDays=${padDays}` : ''}`;
      const res = await fetch(url);
      if (res.status === 429) throw new Error('rate_limited');
      return res.json();
    },
    enabled: !!ticker,
    staleTime: range === '1D' ? 60 * 1000 : 5 * 60 * 1000,
    refetchInterval: range === '1D' ? 60 * 1000 : false,
  });

  // Past earnings — only fetched when the Events toggle is on.
  const { data: earningsResp } = useQuery<{ success: boolean; earnings: CompanyEarnings[] }>({
    queryKey: ['company-earnings', ticker],
    queryFn: async () => (await fetch(`/api/stock/${ticker}/earnings`)).json(),
    enabled: !!ticker && showEvents,
    staleTime: 12 * 60 * 60 * 1000,
    gcTime: 24 * 60 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const events = useMemo(() => {
    if (!showEvents || !earningsResp?.earnings) return undefined;
    return earningsResp.earnings.map((e) => ({
      ts: Math.floor(new Date(`${e.period}T12:00:00Z`).getTime() / 1000),
      beat: e.actual != null && e.estimate != null ? e.actual >= e.estimate : null,
    }));
  }, [showEvents, earningsResp]);

  // This user's buy/sell markers for `ticker`. holding/sales are already
  // scoped by the caller (StockPricePanel), so this is a pure derivation —
  // no extra fetch here.
  const transactions = useMemo(() => {
    if (!showTransactions) return undefined;
    return buildTransactionMarkers(holding, sales, purchases).map((m) => ({ ts: m.tsSeconds, kind: m.kind }));
  }, [showTransactions, holding, sales, purchases]);

  // Anchor the visible window to the newest loaded bar (avoids Date.now during
  // render). Bars before this are warm-up only so long SMAs cover the window.
  const displayFrom = useMemo(() => {
    const t = data?.candles?.t;
    if (range === '1D' || maxPeriod <= 0 || !t?.length) return undefined;
    let lastT = t[0];
    for (const x of t) if (x > lastT) lastT = x;
    return lastT - RANGE_META[range].daysBack * 86400;
  }, [range, maxPeriod, data]);

  // Body scroll lock + Esc to close. (Rendered client-only via ssr:false, so
  // document is always available — no mount gate needed.)
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const candles = data?.candles ?? null;
  const hasData = !!candles && candles.t.length > 0;

  // Live snapshot the AI reads — rebuilt as the chart state changes.
  const currentPrice = livePrice ?? quote?.c ?? null;
  const snapshot = useMemo(
    () =>
      buildChartSnapshot({
        symbol: ticker,
        timeframe: range,
        chartType,
        indicatorLabels: indicators.map(indicatorLabel),
        showVolume,
        showEvents,
        currentPrice,
        changePctToday: quote?.dp ?? null,
        candles,
      }),
    [ticker, range, chartType, indicators, showVolume, showEvents, currentPrice, quote?.dp, candles],
  );

  // Execute an AI-issued chart action against the real chart handlers.
  const dispatchChartAction = async (action: ChartAction) => {
    switch (action.type) {
      case 'chart_set_timeframe':
        handleSetRange(action.range);
        break;
      case 'chart_set_type':
        onChartType(action.chartType);
        break;
      case 'chart_add_indicator': {
        const def = getIndicatorDef(action.indicator);
        if (!def) break;
        const params = defaultParamsFor(def);
        if (action.length != null) {
          const spec = def.params.find((p) => p.key === 'length');
          if (spec) params.length = Math.min(spec.max, Math.max(spec.min, Math.round(action.length)));
        }
        const used = new Set(indicators.map((i) => i.color));
        const color = INDICATOR_PALETTE.find((c) => !used.has(c)) ?? INDICATOR_PALETTE[indicators.length % INDICATOR_PALETTE.length];
        const inst: IndicatorInstance = { id: `${action.indicator}-${Date.now()}`, type: action.indicator, params, color };
        onReplaceIndicators([...indicators, inst]);
        break;
      }
      case 'chart_remove_indicator':
        onReplaceIndicators(indicators.filter((i) => i.type !== action.indicator));
        break;
      case 'chart_clear_indicators':
        onReplaceIndicators([]);
        break;
      case 'chart_apply_preset':
        onApplyPreset(action.preset);
        break;
      case 'chart_toggle_volume':
        if (action.show !== showVolume) onToggleVolume();
        break;
      case 'chart_toggle_events':
        if (action.show !== showEvents) onToggleEvents();
        break;
      case 'chart_set_alert': {
        const base = currentPrice ?? action.price;
        const alertType =
          action.direction === 'below'
            ? 'price_below'
            : action.direction === 'above'
            ? 'price_above'
            : action.price >= base
            ? 'price_above'
            : 'price_below';
        await createAlert({ symbol: ticker.toUpperCase(), alertType, threshold: action.price });
        break;
      }
    }
  };

  return createPortal(
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed inset-0 z-[100] flex flex-col bg-background"
      role="dialog"
      aria-modal="true"
      aria-label={`${ticker} advanced chart`}
    >
      <ChartToolbar
        symbol={ticker.toUpperCase()}
        price={quote?.c}
        changePct={quote?.dp}
        chartType={chartType}
        onChartType={onChartType}
        range={range}
        onRange={handleSetRange}
        indicators={indicators}
        onAddIndicator={onAddIndicator}
        onRemoveIndicator={onRemoveIndicator}
        onUpdateIndicator={onUpdateIndicator}
        onApplyPreset={onApplyPreset}
        onClearIndicators={handleClearIndicators}
        presets={presets}
        onApplyUserPreset={handleApplyPreset}
        onSavePreset={handleSavePreset}
        onDeletePreset={deletePreset}
        showVolume={showVolume}
        onToggleVolume={onToggleVolume}
        showEvents={showEvents}
        onToggleEvents={onToggleEvents}
        showTransactions={showTransactions}
        onToggleTransactions={onToggleTransactions}
        tool={tool}
        onToolChange={setTool}
        aiOpen={aiOpen}
        onToggleAI={() => setAiOpen((v) => !v)}
        onClose={onClose}
      />

      {/* flex row (not an absolute overlay) so the AI panel reserves real width —
          the chart's `autoSize: true` reacts to the resulting reflow and keeps its
          price axis visible beside the panel, instead of rendering underneath it. */}
      <div className="flex min-h-0 flex-1">
        <div className="relative min-w-0 flex-1">
          {isLoading && !hasData && (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading chart…
            </div>
          )}

          {!isLoading && (isError || !hasData) && (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
              <AlertCircle className="h-6 w-6 text-muted-foreground/80" />
              {isError ? 'Market data is rate-limited — try again in a moment.' : 'No chart data available.'}
            </div>
          )}

          {hasData && (
            <AdvancedChart
              candles={candles}
              chartType={chartType}
              indicators={indicators}
              showVolume={showVolume}
              isDark={isDark}
              intraday={INTRADAY_RANGES.has(range)}
              fitKey={`${range}:${displayFrom ?? 0}`}
              events={events}
              transactions={transactions}
              displayFrom={displayFrom}
              livePrice={livePrice}
              tool={tool}
              onCreateAlert={handleCreateAlert}
            />
          )}
        </div>

        {/* Always mounted (never conditionally rendered) — width animates to 0
            when closed instead of unmounting, so the useChat conversation
            state survives closing/reopening the panel while this fullscreen
            chart stays open. Matches AISidePanel's own pattern for the same
            reason. Resets when the chart modal itself closes (fresh mount
            next time) — conversations aren't persisted server-side here. */}
        <ChartAIPanel
          open={aiOpen}
          symbol={ticker}
          snapshot={snapshot}
          onAction={dispatchChartAction}
          onClose={() => setAiOpen(false)}
        />
      </div>
    </motion.div>,
    document.body
  );
}
