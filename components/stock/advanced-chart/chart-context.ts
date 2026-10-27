/**
 * Chart view + action types shared by the fullscreen chart and Ask Bull.
 *
 * `buildChartSnapshot()` describes what the user is looking at (timeframe,
 * chart type, indicators, and the visible window's price stats). Bull gets it
 * as page context; the trend numbers (moving averages, RSI, support) come from
 * its getTechnicals tool on daily bars, not from whatever bars are on screen.
 *
 * `ChartAction` is the union the chart tools emit as `__clientAction` and the
 * modal dispatches to the real chart handlers.
 */

import type { ChartRange, AdvancedChartType } from '@/hooks/use-chart-prefs';
import type { OHLCV } from '@/lib/finance/indicators';

// ── Actions the AI can perform on the chart ─────────────────────────────────
export type ChartAction =
  | { type: 'chart_set_timeframe'; range: ChartRange }
  | { type: 'chart_set_type'; chartType: AdvancedChartType }
  | { type: 'chart_add_indicator'; indicator: string; length?: number }
  | { type: 'chart_remove_indicator'; indicator: string }
  | { type: 'chart_clear_indicators' }
  | { type: 'chart_apply_preset'; preset: string }
  | { type: 'chart_toggle_volume'; show: boolean }
  | { type: 'chart_toggle_events'; show: boolean };

// ── The view Bull reads ─────────────────────────────────────────────────────
export interface ChartSnapshot {
  symbol: string;
  timeframe: ChartRange;
  chartType: AdvancedChartType;
  indicators: string[];        // human labels, e.g. ["SMA 50", "RSI 14"]
  showVolume: boolean;
  showEvents: boolean;
  /** Stats over the *visible* window (from the loaded candles). */
  window: {
    bars: number;
    open: number;
    close: number;
    high: number;
    low: number;
    changePct: number;         // first → last close over the window
  } | null;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildChartSnapshot(args: {
  symbol: string;
  timeframe: ChartRange;
  chartType: AdvancedChartType;
  indicatorLabels: string[];
  showVolume: boolean;
  showEvents: boolean;
  candles: OHLCV | null;
  /** Start of the visible window (unix s). Bars before it are indicator
   *  warm-up and must not count as "the period". */
  displayFrom?: number;
}): ChartSnapshot {
  const { candles } = args;
  const closes = candles?.c ?? [];
  const n = closes.length;
  const from = args.displayFrom != null && candles ? candles.t.findIndex((t) => t >= args.displayFrom!) : 0;
  const start = from > 0 ? from : 0;

  let window: ChartSnapshot['window'] = null;
  if (candles && n > start) {
    let hi = candles.h[start];
    let lo = candles.l[start];
    for (let i = start; i < n; i++) {
      if (candles.h[i] > hi) hi = candles.h[i];
      if (candles.l[i] < lo) lo = candles.l[i];
    }
    const first = closes[start];
    const last = closes[n - 1];
    window = {
      bars: n - start,
      open: round(candles.o[start]),
      close: round(last),
      high: round(hi),
      low: round(lo),
      changePct: first ? round(((last - first) / first) * 100) : 0,
    };
  }

  return {
    symbol: args.symbol.toUpperCase(),
    timeframe: args.timeframe,
    chartType: args.chartType,
    indicators: args.indicatorLabels,
    showVolume: args.showVolume,
    showEvents: args.showEvents,
    window,
  };
}
